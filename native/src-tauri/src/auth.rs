// Native Google OAuth module (AppAuth-style PKCE flow) + YouTube Data API v3
// client.
//
// On Android/iOS, the real OAuth flow is driven by the AppAuth plugin which
// launches the system browser and captures the redirect. In this Tauri
// sandbox build (no AppAuth plugin registered), `oauth_sign_in` returns an
// explicit error so the frontend can fall back to the web-app NextAuth flow
// or the simulated login.
//
// `oauth_get_youtube_liked` and `oauth_get_youtube_subscriptions` are real
// YouTube Data API v3 clients — they take an access_token (issued by the
// real OAuth flow elsewhere) and call the public Google endpoints.

use crate::models::VideoItem;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use once_cell::sync::Lazy;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const YOUTUBE_API_BASE: &str = "https://www.googleapis.com/youtube/v3";
const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

// ---------- Serde structs (returned to the frontend) ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub user: OAuthUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthSession {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: i64,
    pub user: OAuthUser,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionChannel {
    pub channel_id: String,
    pub title: String,
    pub thumbnail: String,
}

// ---------- In-memory session store ----------
//
// Persisted only for the lifetime of the process. The real AppAuth plugin
// would persist refresh tokens to secure device storage.

static SESSION: Lazy<Mutex<Option<OAuthSession>>> = Lazy::new(|| Mutex::new(None));

static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(HTTP_TIMEOUT)
        .user_agent("LookOn/1.0")
        .build()
        .expect("failed to build reqwest client for auth")
});

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------- PKCE helpers ----------
//
// Even though `oauth_sign_in` is a stub in this build, the PKCE helpers are
// included so the AppAuth plugin integration can call into them when it
// lands. They are `pub` so the plugin crate (when registered) can reuse them.

/// The unreserved chars per RFC 3986 plus `-` `.` `_` `~` (the PKCE set).
const PKCE_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/// Generate a high-entropy PKCE code_verifier (64 chars — well within the
/// 43-128 range required by RFC 7636).
pub fn generate_code_verifier() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    (0..64)
        .map(|_| PKCE_CHARS[rng.gen_range(0..PKCE_CHARS.len())] as char)
        .collect()
}

/// Compute the S256 code_challenge: BASE64URL-ENCODE(SHA256(ASCII(verifier)))
/// with no padding.
pub fn code_challenge_s256(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(digest)
}

// ---------- YouTube API JSON shapes ----------

#[derive(Debug, Deserialize)]
struct YtPlaylistItemList {
    #[serde(default)]
    items: Vec<YtPlaylistItem>,
}

#[derive(Debug, Deserialize)]
struct YtPlaylistItem {
    #[serde(default)]
    snippet: Option<YtPlaylistItemSnippet>,
    #[serde(default)]
    content_details: Option<YtPlaylistItemContentDetails>,
}

#[derive(Debug, Deserialize)]
struct YtPlaylistItemSnippet {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    channel_title: Option<String>,
    #[serde(default)]
    thumbnails: Option<YtThumbnails>,
    #[serde(default)]
    resource_id: Option<YtResourceId>,
}

#[derive(Debug, Default, Deserialize)]
struct YtPlaylistItemContentDetails {
    #[serde(default)]
    video_id: Option<String>,
    #[serde(default)]
    video_published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtResourceId {
    #[serde(default)]
    video_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtThumbnails {
    #[serde(default)]
    high: Option<YtThumb>,
    #[serde(default)]
    medium: Option<YtThumb>,
    #[serde(default)]
    default: Option<YtThumb>,
}

impl YtThumbnails {
    fn best_url(&self) -> Option<String> {
        self.high
            .as_ref()
            .or(self.medium.as_ref())
            .or(self.default.as_ref())
            .and_then(|t| t.url.clone())
    }
}

#[derive(Debug, Deserialize)]
struct YtThumb {
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtSubscriptionList {
    #[serde(default)]
    items: Vec<YtSubscription>,
}

#[derive(Debug, Deserialize)]
struct YtSubscription {
    #[serde(default)]
    snippet: Option<YtSubscriptionSnippet>,
}

#[derive(Debug, Deserialize)]
struct YtSubscriptionSnippet {
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    resource_id: Option<YtSubResourceId>,
    #[serde(default)]
    thumbnails: Option<YtThumbnails>,
}

#[derive(Debug, Deserialize)]
struct YtSubResourceId {
    #[serde(default)]
    channel_id: Option<String>,
}

// ---------- Tauri commands ----------

/// Launch the system browser for Google OAuth using PKCE.
///
/// On Android/iOS this would call into the AppAuth plugin which captures the
/// redirect URI. In this Tauri sandbox build (no AppAuth plugin registered),
/// we return an explicit error so the frontend can fall back to the NextAuth
/// web flow or the simulated login.
#[tauri::command]
pub async fn oauth_sign_in() -> Result<OAuthResult, String> {
    // PKCE material is generated here so that, when the AppAuth plugin is
    // wired up, this same function can hand it off to the plugin's launch
    // flow. For now we surface a clear error.
    let _verifier = generate_code_verifier();
    let _challenge = code_challenge_s256(&_verifier);
    Err("OAuth requires app build with AppAuth plugin".to_string())
}

/// Clear the in-memory session.
#[tauri::command]
pub async fn oauth_sign_out() -> Result<(), String> {
    if let Ok(mut guard) = SESSION.lock() {
        *guard = None;
    }
    Ok(())
}

/// Returns the current session if signed in, `None` otherwise.
#[tauri::command]
pub async fn oauth_get_session() -> Option<OAuthSession> {
    if let Ok(guard) = SESSION.lock() {
        if let Some(s) = guard.as_ref() {
            // Treat as expired past expires_at + 5s grace.
            if s.expires_at == 0 || s.expires_at + 5_000 > now_millis() {
                return Some(s.clone());
            }
        }
    }
    None
}

/// Fetch the user's Liked Videos playlist (the special `LL` playlistId) via
/// YouTube Data API v3. Requires a valid OAuth `access_token` with the
/// `youtube.readonly` scope.
#[tauri::command]
pub async fn oauth_get_youtube_liked(access_token: String) -> Result<Vec<VideoItem>, String> {
    let url = format!(
        "{}/playlistItems?part=snippet,contentDetails&playlistId=LL&maxResults=50",
        YOUTUBE_API_BASE
    );
    let resp = HTTP
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("YouTube API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "YouTube API returned {}: {}",
            status,
            body.chars().take(500).collect::<String>()
        ));
    }

    let parsed: YtPlaylistItemList = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse YouTube response: {}", e))?;

    let mut out = Vec::new();
    for item in parsed.items.into_iter() {
        let snippet = match item.snippet {
            Some(s) => s,
            None => continue,
        };
        let content = item.content_details.unwrap_or_default();
        let video_id = content
            .video_id
            .clone()
            .or_else(|| snippet.resource_id.as_ref().and_then(|r| r.video_id.clone()))
            .unwrap_or_default();
        if video_id.is_empty() {
            continue;
        }
        let thumbnail = snippet
            .thumbnails
            .as_ref()
            .and_then(|t| t.best_url())
            .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", video_id));
        out.push(VideoItem {
            id: video_id.clone(),
            youtube_id: video_id,
            title: snippet.title.unwrap_or_else(|| "Untitled".into()),
            channel: snippet.channel_title.unwrap_or_else(|| "Unknown".into()),
            channel_avatar: None,
            thumbnail,
            duration: 0, // requires a separate videos.list call; left as 0
            views: 0,
            likes: 0,
            published_at: content.video_published_at.unwrap_or_default(),
            category: "Liked".to_string(),
            description: String::new(),
            curated: Some(false),
            promoted: Some(false),
            promoted_label: None,
        });
    }
    Ok(out)
}

/// Fetch the channels the user is subscribed to via `subscriptions.list?mine=true`.
#[tauri::command]
pub async fn oauth_get_youtube_subscriptions(
    access_token: String,
) -> Result<Vec<SubscriptionChannel>, String> {
    let url = format!(
        "{}/subscriptions?part=snippet&mine=true&maxResults=50",
        YOUTUBE_API_BASE
    );
    let resp = HTTP
        .get(&url)
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| format!("YouTube API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "YouTube API returned {}: {}",
            status,
            body.chars().take(500).collect::<String>()
        ));
    }

    let parsed: YtSubscriptionList = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse YouTube response: {}", e))?;

    let mut out = Vec::new();
    for sub in parsed.items.into_iter() {
        let snippet = match sub.snippet {
            Some(s) => s,
            None => continue,
        };
        let channel_id = snippet
            .resource_id
            .as_ref()
            .and_then(|r| r.channel_id.clone())
            .unwrap_or_default();
        if channel_id.is_empty() {
            continue;
        }
        let thumbnail = snippet
            .thumbnails
            .as_ref()
            .and_then(|t| t.best_url())
            .unwrap_or_else(|| {
                format!(
                    "https://api.dicebear.com/7.x/initials/svg?seed={}",
                    urlencoding::encode(&snippet.title.clone().unwrap_or_default())
                )
            });
        out.push(SubscriptionChannel {
            channel_id,
            title: snippet.title.unwrap_or_else(|| "Unknown".into()),
            thumbnail,
        });
    }
    Ok(out)
}

// ---------- Small helpers ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verifier_length_and_charset() {
        let v = generate_code_verifier();
        assert_eq!(v.len(), 64);
        assert!(v.chars().all(|c| c.is_ascii_alphanumeric() || "-._~".contains(c)));
    }

    #[test]
    fn challenge_is_url_safe_no_pad_base64_of_sha256() {
        // Known vector from RFC 7636 Appendix B (S256).
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let expected = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        assert_eq!(code_challenge_s256(verifier), expected);
    }
}
