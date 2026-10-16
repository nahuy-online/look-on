// Shared serde models for the PureTuber VPN Tauri backend.
//
// These mirror the TypeScript types in `native/src/lib/types.ts` so the JSON
// payload crosses the FFI boundary with the same shape the frontend expects.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoItem {
    pub id: String,
    pub youtube_id: String,
    pub title: String,
    pub channel: String,
    #[serde(default)]
    pub channel_avatar: Option<String>,
    pub thumbnail: String,
    #[serde(default)]
    pub duration: i64,
    #[serde(default)]
    pub views: i64,
    #[serde(default)]
    pub likes: i64,
    pub published_at: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub curated: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamFormat {
    pub url: String,
    pub quality: String,
    pub mime_type: String,
    pub container: String,
    #[serde(default)]
    pub bitrate: i64,
    pub kind: String, // "video" | "audio"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub youtube_id: String,
    pub title: String,
    #[serde(default)]
    pub duration: i64,
    pub thumbnail: String,
    pub formats: Vec<StreamFormat>,
    pub best_stream_url: Option<String>,
    pub hls_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub youtube_id: String,
    pub title: String,
    pub channel: String,
    pub thumbnail: String,
    #[serde(default)]
    pub duration: i64,
    #[serde(default)]
    pub quality: String,
    #[serde(default)]
    pub size_mb: i64,
    #[serde(default)]
    pub progress: i64,
    #[serde(default)]
    pub status: String,
    pub created_at: String,
}

/// PATCH for `db_update_download` — every field optional.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadPatch {
    #[serde(default)]
    pub progress: Option<i64>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub size_mb: Option<i64>,
    #[serde(default)]
    pub quality: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub youtube_id: String,
    pub title: String,
    pub channel: String,
    pub thumbnail: String,
    #[serde(default)]
    pub duration: i64,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub progress: i64,
    pub watched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistLite {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub video_ids: Vec<String>,
    pub videos: Vec<VideoItem>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnServer {
    pub id: String,
    pub country: String,
    pub country_code: String,
    pub city: String,
    pub flag: String,
    pub ping: i64,
    pub load: i64,
    pub premium: bool,
    pub servers: i64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VpnStatus {
    Disconnected,
    Connecting,
    Connected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VpnStatusResponse {
    pub status: VpnStatus,
    pub server_id: Option<String>,
    pub exit_ip: String,
    #[serde(default)]
    pub download_speed: u64,
    #[serde(default)]
    pub upload_speed: u64,
    #[serde(default)]
    pub data_downloaded: u64,
    #[serde(default)]
    pub data_uploaded: u64,
    #[serde(default)]
    pub session_start: Option<i64>, // ms epoch
    /// True when the backend is the real Android VpnService tunnel; false when
    /// simulated.
    pub real: bool,
}

impl Default for VpnStatusResponse {
    fn default() -> Self {
        VpnStatusResponse {
            status: VpnStatus::Disconnected,
            server_id: None,
            exit_ip: String::new(),
            download_speed: 0,
            upload_speed: 0,
            data_downloaded: 0,
            data_uploaded: 0,
            session_start: None,
            real: false,
        }
    }
}
