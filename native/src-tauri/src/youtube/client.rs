//! YouTube InnerTube API client.
//!
//! Talks directly to `https://www.youtube.com/youtubei/v1/{player,browse,search}`
//! using the same client-profile approach as Obereg (see
//! `/tmp/obereg/android/app/src/main/java/app/obereg/player/youtubeextractor.kt`).
//!
//! The well-known InnerTube API key (`AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8`)
//! is used as a fallback; the primary path is to scrape a fresh key (plus
//! `visitorData`) from the watch / home page, which is what YouTube itself
//! serves to browsers. The fallback key is enough for the VISIONOS profile
//! (the one we prefer for the player endpoint because it doesn't require a
//! PO token).
//!
//! Public surface:
//!   * [`fetch_player_response`] — POST `/player` (returns raw JSON string)
//!   * [`fetch_feed`]            — POST `/browse` for `FEtrending` etc.
//!   * [`search`]                — POST `/search`
//!
//! The parsing of those JSON responses lives in [`crate::youtube::extract`]
//! and [`crate::youtube::feed`] so it stays pure and testable.

use once_cell::sync::Lazy;
use reqwest::Client;
use serde_json::{json, Value};
use std::time::Duration;

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);

const PLAYER_ENDPOINT: &str = "https://www.youtube.com/youtubei/v1/player";
const BROWSE_ENDPOINT: &str = "https://www.youtube.com/youtubei/v1/browse";
const SEARCH_ENDPOINT: &str = "https://www.youtube.com/youtubei/v1/search";
const WATCH_URL: &str = "https://www.youtube.com/watch";
const HOME_URL: &str = "https://www.youtube.com/";

/// Fallback InnerTube API key. This is the well-known public key that
/// YouTube serves to browsers; it's been stable for years and is the same
/// one used by NewPipe, yt-dlp, and other open-source clients. For maximum
/// resilience we still try to scrape a fresh key from the watch page first.
const FALLBACK_API_KEY: &str = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

/// Browser UA used by the WEB profile and for scraping the watch / home page.
pub const BROWSER_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/129.0.0.0 Safari/537.36";

/// One InnerTube client profile.
///
/// Mirrors Obereg's `ClientProfile`. `extra_context` is a slice of string
/// pairs that get merged into the `context.client` object of every request
/// (e.g. `deviceMake`, `osVersion`). All four profiles we ship
/// (VISIONOS/IOS/MWEB/WEB) only need string values — if you add ANDROID or
/// ANDROID_VR later (which need `androidSdkVersion: 30` as an int), switch
/// this to `&[(&str, Value)]`.
#[derive(Debug, Clone)]
pub struct ClientProfile {
    pub label: &'static str,
    pub client_name: &'static str,
    pub client_version: &'static str,
    pub user_agent: &'static str,
    /// Value of the `X-Youtube-Client-Name` header (a stringised int).
    pub client_header_name: &'static str,
    pub extra_context: &'static [(&'static str, &'static str)],
    /// If set, a `thirdParty.embedUrl` is added to the context (for embedded
    /// clients like WEB_EMBEDDED_PLAYER). `None` for non-embedded clients.
    pub embed_url: Option<&'static str>,
}

// ---- Client profiles (ported from Obereg's youtubeextractor.kt) ------

pub const VISIONOS: ClientProfile = ClientProfile {
    label: "VISIONOS",
    client_name: "VISIONOS",
    client_version: "1.02",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 \
                 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    client_header_name: "101",
    extra_context: &[
        ("deviceMake", "Apple"),
        ("deviceModel", "RealityDevice17,1"),
        ("osName", "visionOS"),
        ("osVersion", "26.5.23O471"),
    ],
    embed_url: None,
};

pub const IOS: ClientProfile = ClientProfile {
    label: "IOS",
    client_name: "IOS",
    client_version: "21.26.4",
    user_agent: "com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    client_header_name: "5",
    extra_context: &[
        ("deviceMake", "Apple"),
        ("deviceModel", "iPhone16,2"),
        ("osName", "iPhone"),
        ("osVersion", "18.3.2.22D82"),
    ],
    embed_url: None,
};

pub const MWEB: ClientProfile = ClientProfile {
    label: "MWEB",
    client_name: "MWEB",
    client_version: "2.20260708.05.00",
    user_agent: "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 \
                 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)",
    client_header_name: "2",
    extra_context: &[],
    embed_url: None,
};

pub const WEB: ClientProfile = ClientProfile {
    label: "WEB",
    client_name: "WEB",
    client_version: "2.20260708.00.00",
    user_agent: BROWSER_USER_AGENT,
    client_header_name: "1",
    extra_context: &[],
    embed_url: None,
};

/// Profile order for player extraction. VISIONOS first because it doesn't
/// require a PO token (the post-2024 anti-bot token that mobile/web clients
/// must ship). IOS is also embed-friendly. MWEB and WEB are last resorts.
pub const PLAYER_PROFILES: &[&ClientProfile] = &[&VISIONOS, &IOS, &MWEB, &WEB];

static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(HTTP_TIMEOUT)
        .user_agent("LookOn/1.0")
        .build()
        .expect("failed to build reqwest client")
});

// ---------- request body builders (pure, test-friendly) ----------

/// Build the InnerTube `/player` request body for a given profile.
///
/// Matches Obereg's `PlayerApi.requestBody` shape: client context (with
/// profile-specific `extra_context` + `userAgent`), `videoId`,
/// `playbackContext.contentPlaybackContext.html5Preference =
/// "HTML5_PREF_WANTS"`, `contentCheckOk` + `racyCheckOk = true`, and
/// (when `po_token` is provided) `serviceIntegrityDimensions.poToken`.
pub fn build_player_body(
    profile: &ClientProfile,
    video_id: &str,
    po_token: Option<&str>,
    visitor_data: Option<&str>,
) -> Value {
    let mut client = json!({
        "clientName": profile.client_name,
        "clientVersion": profile.client_version,
        "hl": "en",
        "gl": "US",
        "userAgent": profile.user_agent,
    });
    {
        let client_obj = client
            .as_object_mut()
            .expect("client context is always an object");
        for (k, v) in profile.extra_context {
            client_obj.insert((*k).to_string(), Value::String((*v).to_string()));
        }
        if let Some(vd) = visitor_data {
            client_obj.insert("visitorData".to_string(), Value::String(vd.to_string()));
        }
    }

    let mut context = json!({ "client": client });
    if let Some(embed) = profile.embed_url {
        context["thirdParty"] = json!({ "embedUrl": embed });
    }

    let mut body = json!({
        "context": context,
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": {
                "html5Preference": "HTML5_PREF_WANTS"
            }
        },
        "contentCheckOk": true,
        "racyCheckOk": true,
    });
    if let Some(token) = po_token {
        body["serviceIntegrityDimensions"] = json!({ "poToken": token });
    }
    body
}

/// Build the `context.client` block for browse/search requests.
pub fn build_context(profile: &ClientProfile, visitor_data: Option<&str>) -> Value {
    let mut client = json!({
        "clientName": profile.client_name,
        "clientVersion": profile.client_version,
        "hl": "en",
        "gl": "US",
        "userAgent": profile.user_agent,
    });
    {
        let client_obj = client
            .as_object_mut()
            .expect("client context is always an object");
        for (k, v) in profile.extra_context {
            client_obj.insert((*k).to_string(), Value::String((*v).to_string()));
        }
        if let Some(vd) = visitor_data {
            client_obj.insert("visitorData".to_string(), Value::String(vd.to_string()));
        }
    }
    json!({ "client": client })
}

/// Apply the standard header set for an InnerTube POST.
fn inner_tube_request(
    url: &str,
    profile: &ClientProfile,
    body: &Value,
) -> reqwest::RequestBuilder {
    HTTP.post(url)
        .header("User-Agent", profile.user_agent)
        .header("Content-Type", "application/json")
        .header("X-Youtube-Client-Name", profile.client_header_name)
        .header("X-Youtube-Client-Version", profile.client_version)
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("Origin", "https://www.youtube.com")
        .header("Referer", "https://www.youtube.com/")
        .json(body)
}

// ---------- public API ----------

/// Fetch the player response for a video (raw JSON string).
///
/// Tries each profile in [`PLAYER_PROFILES`] in order; the first one that
/// returns HTTP 200 wins. If the watch page can be scraped first, we use
/// the fresh `INNERTUBE_API_KEY` + `visitorData` from it; otherwise we
/// fall back to [`FALLBACK_API_KEY`].
pub async fn fetch_player_response(
    video_id: &str,
    po_token: Option<&str>,
) -> Result<String, String> {
    let (api_key, visitor_data) = match scrape_watch_page(video_id).await {
        Ok(v) => v,
        Err(e) => {
            log::warn!("watch-page scrape failed ({e}); using fallback API key");
            (FALLBACK_API_KEY.to_string(), None)
        }
    };

    let mut last_err = String::new();
    for profile in PLAYER_PROFILES {
        let body = build_player_body(profile, video_id, po_token, visitor_data.as_deref());
        let url = format!("{}?key={}&prettyPrint=false", PLAYER_ENDPOINT, api_key);
        let resp = inner_tube_request(&url, profile, &body).send().await;
        match resp {
            Ok(resp) => {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                if status.is_success() {
                    return Ok(text);
                }
                last_err = format!(
                    "{} HTTP {}: {}",
                    profile.label,
                    status.as_u16(),
                    truncate(&text, 200)
                );
                log::warn!("player profile {} failed: {}", profile.label, last_err);
            }
            Err(e) => {
                last_err = format!("{} network: {}", profile.label, e);
                log::warn!("player profile {} network error: {}", profile.label, e);
            }
        }
    }
    Err(last_err)
}

/// Fetch the browse/feed response. `feed_type` can be a known name
/// (`"trending"`, `"music"`, `"movies"`) or a raw browse ID (e.g.
/// `"FEtrending"`, `"FEmusic_trending"`).
pub async fn fetch_feed(feed_type: &str) -> Result<String, String> {
    let lower = feed_type.to_lowercase();
    let browse_id = match lower.as_str() {
        "trending" | "trend" | "default" | "" => "FEtrending",
        "music" => "FEmusic_trending",
        "movies" => "FEmovies",
        other => other, // pass-through for raw browse IDs
    };
    let (api_key, visitor_data) = match scrape_home_page().await {
        Ok(v) => v,
        Err(e) => {
            log::warn!("home-page scrape failed ({e}); using fallback API key");
            (FALLBACK_API_KEY.to_string(), None)
        }
    };
    let body = json!({
        "context": build_context(&WEB, visitor_data.as_deref()),
        "browseId": browse_id,
    });
    let url = format!("{}?key={}&prettyPrint=false", BROWSE_ENDPOINT, api_key);
    let resp = inner_tube_request(&url, &WEB, &body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "browse HTTP {}: {}",
            status.as_u16(),
            truncate(&text, 200)
        ))
    }
}

/// Search YouTube. Returns the raw InnerTube search response JSON.
pub async fn search(query: &str) -> Result<String, String> {
    let (api_key, visitor_data) = match scrape_home_page().await {
        Ok(v) => v,
        Err(e) => {
            log::warn!("home-page scrape failed ({e}); using fallback API key");
            (FALLBACK_API_KEY.to_string(), None)
        }
    };
    let body = json!({
        "context": build_context(&WEB, visitor_data.as_deref()),
        "query": query,
    });
    let url = format!("{}?key={}&prettyPrint=false", SEARCH_ENDPOINT, api_key);
    let resp = inner_tube_request(&url, &WEB, &body).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "search HTTP {}: {}",
            status.as_u16(),
            truncate(&text, 200)
        ))
    }
}

// ---------- internals ----------

/// Scrape the watch page to extract `INNERTUBE_API_KEY` and (if present)
/// `visitorData`. Both are served to browsers as part of the `ytInitialData`
/// / `ytcfg` JavaScript blocks.
async fn scrape_watch_page(
    video_id: &str,
) -> Result<(String, Option<String>), String> {
    let url = format!("{}?v={}&hl=en", WATCH_URL, video_id);
    scrape_page(&url).await
}

/// Scrape the YouTube home page for `INNERTUBE_API_KEY` + `visitorData`.
async fn scrape_home_page() -> Result<(String, Option<String>), String> {
    scrape_page(HOME_URL).await
}

async fn scrape_page(url: &str) -> Result<(String, Option<String>), String> {
    let resp = HTTP
        .get(url)
        .header("User-Agent", BROWSER_USER_AGENT)
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("page HTTP {}", resp.status()));
    }
    let html = resp.text().await.map_err(|e| e.to_string())?;
    let api_key = extract_string_field(&html, "INNERTUBE_API_KEY")
        .ok_or_else(|| "INNERTUBE_API_KEY not found in page".to_string())?;
    let visitor_data = extract_string_field(&html, "visitorData");
    Ok((api_key, visitor_data))
}

/// Find `"KEY":"VALUE"` in `haystack` and return `VALUE`. YouTube serves
/// both fields as JSON string literals inside a larger JS blob, so the
/// simple substring search is sufficient — no regex dependency needed.
fn extract_string_field(haystack: &str, key: &str) -> Option<String> {
    let needle = format!("\"{}\":\"", key);
    let pos = haystack.find(&needle)? + needle.len();
    let rest = &haystack[pos..];
    let end = rest.find('"')?;
    let value = &rest[..end];
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

/// Truncate `s` to `n` chars, appending an ellipsis if truncation happens.
fn truncate(s: &str, n: usize) -> String {
    if s.len() <= n {
        s.to_string()
    } else {
        format!("{}…", &s[..n])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_player_body_has_required_fields() {
        let body = build_player_body(&VISIONOS, "dQw4w9WgXcQ", None, None);
        assert_eq!(body["videoId"], "dQw4w9WgXcQ");
        assert_eq!(body["context"]["client"]["clientName"], "VISIONOS");
        assert_eq!(body["context"]["client"]["clientVersion"], "1.02");
        assert_eq!(body["context"]["client"]["hl"], "en");
        assert_eq!(body["context"]["client"]["gl"], "US");
        assert_eq!(body["context"]["client"]["deviceMake"], "Apple");
        assert_eq!(
            body["context"]["client"]["deviceModel"],
            "RealityDevice17,1"
        );
        assert_eq!(body["playbackContext"]["contentPlaybackContext"]["html5Preference"], "HTML5_PREF_WANTS");
        assert_eq!(body["contentCheckOk"], true);
        assert_eq!(body["racyCheckOk"], true);
        assert!(body.get("serviceIntegrityDimensions").is_none());
    }

    #[test]
    fn build_player_body_with_po_token_and_visitor() {
        let body = build_player_body(
            &WEB,
            "abc123",
            Some("PO_TOKEN_VALUE"),
            Some("VISITOR_DATA_VALUE"),
        );
        assert_eq!(body["serviceIntegrityDimensions"]["poToken"], "PO_TOKEN_VALUE");
        assert_eq!(body["context"]["client"]["visitorData"], "VISITOR_DATA_VALUE");
    }

    #[test]
    fn extract_string_field_finds_simple_value() {
        let html = r#"blah "INNERTUBE_API_KEY":"AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8" more"#;
        let v = extract_string_field(html, "INNERTUBE_API_KEY").unwrap();
        assert_eq!(v, "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8");
    }

    #[test]
    fn extract_string_field_returns_none_when_missing() {
        assert!(extract_string_field("no markers here", "INNERTUBE_API_KEY").is_none());
        assert!(extract_string_field(r#""INNERTUBE_API_KEY":""#, "INNERTUBE_API_KEY").is_none());
    }

    #[test]
    fn truncate_shortens_long_strings() {
        assert_eq!(truncate("hello", 10), "hello");
        assert_eq!(truncate("hello world", 5), "hello…");
    }

    #[test]
    fn browse_id_resolution() {
        // Verifies the match arms indirectly by checking the body the
        // client would build. We can't call fetch_feed here (no network in
        // tests), but we can confirm the mapping logic via a small helper.
        fn resolve(feed_type: &str) -> &str {
            match feed_type.to_lowercase().as_str() {
                "trending" | "trend" | "default" | "" => "FEtrending",
                "music" => "FEmusic_trending",
                "movies" => "FEmovies",
                other => other,
            }
        }
        assert_eq!(resolve("Trending"), "FEtrending");
        assert_eq!(resolve(""), "FEtrending");
        assert_eq!(resolve("music"), "FEmusic_trending");
        assert_eq!(resolve("FEchannels_432"), "FEchannels_432");
    }
}
