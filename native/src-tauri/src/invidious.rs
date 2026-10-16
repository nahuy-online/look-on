// Invidious API client for the Rust backend.
//
// Multi-instance fallback + 5-minute in-memory cache, mirroring the web app's
// `src/lib/invidious.ts`. Used by `trending`, `search`, `related`, and
// `video_streams` Tauri commands.

use crate::models::{StreamFormat, StreamInfo, VideoItem};
use once_cell::sync::Lazy;
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const HTTP_TIMEOUT: Duration = Duration::from_secs(6);
const CACHE_TTL: Duration = Duration::from_secs(5 * 60);

const INV_INSTANCES: &[&str] = &[
    "https://invidious.fdn.fr",
    "https://inv.tux.pizza",
    "https://yewtu.be",
    "https://invidious.nerdvpn.de",
    "https://iv.ggtyler.dev",
];

// Invidious JSON shapes (only the fields we use).
#[derive(Debug, Deserialize)]
pub(crate) struct InvVideo {
    #[serde(default)]
    pub video_id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub author_thumbnails: Option<Vec<InvThumb>>,
    #[serde(default)]
    pub video_thumbnails: Option<Vec<InvThumb>>,
    #[serde(default)]
    pub length_seconds: Option<i64>,
    #[serde(default)]
    pub view_count: Option<i64>,
    #[serde(default)]
    pub like_count: Option<i64>,
    #[serde(default)]
    pub published: Option<i64>,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct InvThumb {
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct InvSearchResponse {
    #[serde(default)]
    pub videos: Option<Vec<InvVideo>>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct InvVideoDetail {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub length_seconds: Option<i64>,
    #[serde(default)]
    pub video_id: Option<String>,
    #[serde(default)]
    pub video_thumbnails: Option<Vec<InvThumb>>,
    #[serde(default)]
    pub adaptive_formats: Option<Vec<InvFormat>>,
    #[serde(default)]
    pub format_streams: Option<Vec<InvFormat>>,
    #[serde(default)]
    pub hls_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct InvFormat {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub quality_label: Option<String>,
    #[serde(default)]
    pub audio_quality: Option<String>,
    #[serde(default)]
    #[serde(rename = "type")]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub container: Option<String>,
    #[serde(default)]
    pub bitrate: Option<i64>,
}

#[derive(Clone)]
struct CacheEntry {
    items: Vec<VideoItem>,
    ts: Instant,
    // For streams cache we store the serialized StreamInfo JSON (since the
    // generic cache is typed to Vec<VideoItem>). Streams cache below is separate.
}

static CACHE: Lazy<Mutex<HashMap<String, CacheEntry>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static STREAM_CACHE: Lazy<Mutex<HashMap<String, (Instant, StreamInfo)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static HTTP: Lazy<Client> = Lazy::new(|| {
    Client::builder()
        .timeout(HTTP_TIMEOUT)
        .user_agent("PureTuberVPN/1.0")
        .build()
        .expect("failed to build reqwest client")
});

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn map_video(v: &InvVideo, category: &str) -> Option<VideoItem> {
    let id = v.video_id.clone()?;
    if id.is_empty() {
        return None;
    }
    let published = v.published.unwrap_or(0) * 1000;
    let published_at = if published > 0 {
        chrono::DateTime::from_timestamp_millis(published)
            .map(|d| d.to_rfc3339())
            .unwrap_or_else(|| now_millis().to_string())
    } else {
        now_millis().to_string()
    };
    let thumb = v
        .video_thumbnails
        .as_ref()
        .and_then(|t| t.first())
        .map(|t| t.url.clone())
        .filter(|u| !u.is_empty())
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id));
    let avatar = v
        .author_thumbnails
        .as_ref()
        .and_then(|t| t.first())
        .map(|t| {
            if t.url.starts_with("http") {
                t.url.clone()
            } else {
                format!("{}{}", INV_INSTANCES[0], t.url)
            }
        })
        .unwrap_or_else(|| {
            format!(
                "https://api.dicebear.com/7.x/initials/svg?seed={}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff",
                urlencoding::encode(&v.author.clone().unwrap_or_else(|| "Unknown".into()))
            )
        });

    Some(VideoItem {
        id: id.clone(),
        youtube_id: id,
        title: v.title.clone().unwrap_or_else(|| "Untitled".into()),
        channel: v.author.clone().unwrap_or_else(|| "Unknown".into()),
        channel_avatar: Some(avatar),
        thumbnail: thumb,
        duration: v.length_seconds.unwrap_or(0),
        views: v.view_count.unwrap_or(0),
        likes: v.like_count.unwrap_or(0),
        published_at,
        category: category.to_string(),
        description: v.description.clone().unwrap_or_default(),
        curated: Some(false),
    })
}

async fn fetch_instance<T: serde::de::DeserializeOwned>(path: &str) -> Option<T> {
    for inst in INV_INSTANCES {
        let url = format!("{}{}", inst, path);
        match HTTP.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => match resp.json::<T>().await {
                Ok(parsed) => return Some(parsed),
                Err(_) => continue,
            },
            _ => continue,
        }
    }
    None
}

pub async fn trending(category: &str) -> Vec<VideoItem> {
    let key = format!("inv:trending:{}", category);
    if let Ok(map) = CACHE.lock() {
        if let Some(e) = map.get(&key) {
            if e.ts.elapsed() < CACHE_TTL {
                return e.items.clone();
            }
        }
    }

    let mut items: Vec<VideoItem> = Vec::new();

    if category == "All" {
        if let Some(arr) = fetch_instance::<Vec<InvVideo>>("/api/v1/trending?region=US").await {
            for v in arr.iter() {
                if let Some(mapped) = map_video(v, "All") {
                    items.push(mapped);
                }
            }
        }
    } else {
        let inv_cat = match category {
            "Music" => "music",
            "Gaming" => "gaming",
            "Tech" => "technology",
            "News" => "news",
            "Sports" => "sports",
            "Education" => "education",
            "Entertainment" => "entertainment",
            "Travel" => "travel",
            "Cooking" => "cooking",
            _ => category,
        };
        let q = urlencoding::encode(inv_cat);
        let path = format!("/api/v1/search?q={}&sort_by=view_count&type=video", q);
        if let Some(resp) = fetch_instance::<InvSearchResponse>(&path).await {
            if let Some(videos) = resp.videos {
                for v in videos.iter() {
                    if let Some(mapped) = map_video(v, category) {
                        items.push(mapped);
                    }
                }
            }
        } else if let Some(arr) = fetch_instance::<Vec<InvVideo>>(&path).await {
            for v in arr.iter() {
                if let Some(mapped) = map_video(v, category) {
                    items.push(mapped);
                }
            }
        }
    }

    // De-dup
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    items.retain(|v| seen.insert(v.youtube_id.clone()));
    items.truncate(24);

    if let Ok(mut map) = CACHE.lock() {
        map.insert(
            key,
            CacheEntry {
                items: items.clone(),
                ts: Instant::now(),
            },
        );
    }
    items
}

pub async fn search(q: &str) -> Vec<VideoItem> {
    let key = format!("inv:search:{}", q);
    if let Ok(map) = CACHE.lock() {
        if let Some(e) = map.get(&key) {
            if e.ts.elapsed() < CACHE_TTL {
                return e.items.clone();
            }
        }
    }

    let encoded = urlencoding::encode(q);
    let path = format!(
        "/api/v1/search?q={}&sort_by=relevance&type=video",
        encoded
    );
    let mut items: Vec<VideoItem> = Vec::new();
    if let Some(resp) = fetch_instance::<InvSearchResponse>(&path).await {
        if let Some(videos) = resp.videos {
            for v in videos.iter() {
                if let Some(mapped) = map_video(v, "All") {
                    items.push(mapped);
                }
            }
        }
    } else if let Some(arr) = fetch_instance::<Vec<InvVideo>>(&path).await {
        for v in arr.iter() {
            if let Some(mapped) = map_video(v, "All") {
                items.push(mapped);
            }
        }
    }

    items.truncate(20);
    if let Ok(mut map) = CACHE.lock() {
        map.insert(
            key,
            CacheEntry {
                items: items.clone(),
                ts: Instant::now(),
            },
        );
    }
    items
}

pub async fn related(youtube_id: &str, category: &str) -> Vec<VideoItem> {
    let key = format!("inv:related:{}", youtube_id);
    if let Ok(map) = CACHE.lock() {
        if let Some(e) = map.get(&key) {
            if e.ts.elapsed() < CACHE_TTL {
                return e.items.clone();
            }
        }
    }

    // Fetch the source video's title, then search by it.
    let detail_path = format!("/api/v1/videos/{}", youtube_id);
    let title = match fetch_instance::<InvVideoDetail>(&detail_path).await {
        Some(d) => d.title.unwrap_or_default(),
        None => String::new(),
    };
    let q_text = if title.is_empty() {
        String::new()
    } else {
        title
            .split(" - ")
            .next()
            .unwrap_or(&title)
            .chars()
            .take(40)
            .collect::<String>()
    };
    let mut items: Vec<VideoItem> = Vec::new();
    if !q_text.is_empty() {
        let q = urlencoding::encode(&q_text);
        let path = format!("/api/v1/search?q={}&sort_by=relevance&type=video", q);
        if let Some(resp) = fetch_instance::<InvSearchResponse>(&path).await {
            if let Some(videos) = resp.videos {
                for v in videos.iter() {
                    if let Some(mapped) = map_video(v, category) {
                        items.push(mapped);
                    }
                }
            }
        } else if let Some(arr) = fetch_instance::<Vec<InvVideo>>(&path).await {
            for v in arr.iter() {
                if let Some(mapped) = map_video(v, category) {
                    items.push(mapped);
                }
            }
        }
    }

    // Exclude the source video.
    items.retain(|v| v.youtube_id != youtube_id);
    items.truncate(12);

    if let Ok(mut map) = CACHE.lock() {
        map.insert(
            key,
            CacheEntry {
                items: items.clone(),
                ts: Instant::now(),
            },
        );
    }
    items
}

pub async fn video_streams(youtube_id: &str) -> Option<StreamInfo> {
    if let Ok(map) = STREAM_CACHE.lock() {
        if let Some((ts, info)) = map.get(youtube_id) {
            if ts.elapsed() < CACHE_TTL {
                return Some(info.clone());
            }
        }
    }

    let detail_path = format!("/api/v1/videos/{}", youtube_id);
    let detail = fetch_instance::<InvVideoDetail>(&detail_path).await?;

    let mut formats: Vec<StreamFormat> = Vec::new();

    if let Some(af) = detail.adaptive_formats.as_ref() {
        for f in af.iter() {
            if let Some(url) = f.url.as_ref() {
                let mime = f.mime_type.clone().unwrap_or_default();
                let kind = if mime.starts_with("audio") { "audio" } else { "video" };
                formats.push(StreamFormat {
                    url: url.clone(),
                    quality: f
                        .quality_label
                        .clone()
                        .or_else(|| f.audio_quality.clone())
                        .unwrap_or_default(),
                    mime_type: mime,
                    container: f.container.clone().unwrap_or_default(),
                    bitrate: f.bitrate.unwrap_or(0),
                    kind: kind.to_string(),
                });
            }
        }
    }

    // Muxed formatStreams (combined audio+video) — preferred for the <video> tag
    // because browsers can't demux adaptive formats without MSE.
    let mut best_stream_url: Option<String> = None;
    if let Some(fs) = detail.format_streams.as_ref() {
        // Pick the highest resolution muxed stream (1080p > 720p > ...)
        let mut best: Option<&InvFormat> = None;
        let mut best_score = -1i64;
        for f in fs.iter() {
            let score = f
                .quality_label
                .as_ref()
                .and_then(|q| q.trim_end_matches('p').parse::<i64>().ok())
                .unwrap_or(0);
            if score > best_score && f.url.is_some() {
                best_score = score;
                best = Some(f);
            }
        }
        if let Some(b) = best {
            if let Some(u) = b.url.as_ref() {
                best_stream_url = Some(u.clone());
            }
        }
        for f in fs.iter() {
            if let Some(url) = f.url.as_ref() {
                let mime = f.mime_type.clone().unwrap_or_default();
                formats.push(StreamFormat {
                    url: url.clone(),
                    quality: f
                        .quality_label
                        .clone()
                        .or_else(|| f.audio_quality.clone())
                        .unwrap_or_default(),
                    mime_type: mime,
                    container: f.container.clone().unwrap_or_default(),
                    bitrate: f.bitrate.unwrap_or(0),
                    kind: "video".to_string(),
                });
            }
        }
    }

    // If no muxed stream but we have HLS, the frontend can fall back to IFrame.
    let hls_url = detail.hls_url.clone();

    let thumbnail = detail
        .video_thumbnails
        .as_ref()
        .and_then(|t| t.first())
        .map(|t| t.url.clone())
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", youtube_id));

    let info = StreamInfo {
        youtube_id: youtube_id.to_string(),
        title: detail.title.unwrap_or_default(),
        duration: detail.length_seconds.unwrap_or(0),
        thumbnail,
        formats,
        best_stream_url,
        hls_url,
    };

    if let Ok(mut map) = STREAM_CACHE.lock() {
        map.insert(youtube_id.to_string(), (Instant::now(), info.clone()));
    }
    Some(info)
}

// Random helper for simulated VPN stats — kept here so we have a single rand
// import site.
pub fn rand_range(min: u64, max: u64) -> u64 {
    rand::thread_rng().gen_range(min..max)
}
