// Look On — Tauri 2.0 backend entry point.
//
// Registers:
//   - HTTP plugin (so the frontend can `fetch` Invidious directly if needed)
//   - SQL plugin (so the frontend can talk to SQLite directly if we ever
//     expose it; the Rust side uses `rusqlite` directly for now)
//   - All `#[tauri::command]` functions (Invidious, DB, VPN, OAuth)
//
// On Android, the WireGuard plugin would be registered here too once its JNI
// bridge is implemented (see `android-plugins/wireguard/src/lib.rs`).

mod auth;
mod db;
mod invidious;
mod models;
mod vpn;

use std::sync::Arc;

use models::{
    DownloadItem, DownloadPatch, HistoryItem, PlaylistLite, PromotedVideo, StreamInfo, VideoItem,
    VpnServer, VpnStatusResponse,
};
use tauri::Manager;
use vpn::VpnHandle;

/// Tauri-managed state: SQLite connection + VPN handle.
struct AppState {
    db: db::Db,
    vpn: Box<dyn VpnHandle>,
}

// ---------- Invidious commands ----------

/// Fetch the Invidious trending feed for `category` and inject any active
/// promoted videos at their 1-indexed positions. Promoted videos are marked
/// with `promoted: true` + `promotedLabel` so the frontend can render the
/// amber "Promoted" badge.
#[tauri::command]
async fn trending(
    state: tauri::State<'_, Arc<AppState>>,
    category: String,
) -> Result<Vec<VideoItem>, String> {
    let mut items = invidious::trending(&category).await;

    // Inject promoted videos. We pull everything matching the category filter
    // (active + inactive), then keep only the active ones, convert to
    // VideoItem, sort by 1-indexed position ascending, and splice each into
    // the items vector at `position - 1` (clamped to the current length).
    let promoted = db::get_promoted(&state.db, &category).unwrap_or_default();
    let mut promoted_items: Vec<(i64, VideoItem)> = promoted
        .into_iter()
        .filter(|p| p.active)
        .map(|p| {
            let pos = p.position;
            let label = if p.label.is_empty() {
                "Promoted".to_string()
            } else {
                p.label.clone()
            };
            let youtube_id = p.youtube_id.clone();
            let item = VideoItem {
                id: youtube_id.clone(),
                youtube_id,
                title: p.title,
                channel: p.channel,
                channel_avatar: None,
                thumbnail: p.thumbnail,
                duration: p.duration,
                views: 0,
                likes: 0,
                published_at: p.created_at.clone(),
                category: p.category,
                description: String::new(),
                curated: Some(false),
                promoted: Some(true),
                promoted_label: Some(label),
            };
            (pos, item)
        })
        .collect();
    promoted_items.sort_by_key(|(p, _)| *p);
    for (pos, item) in promoted_items {
        // `pos` is 1-indexed; clamp into [1, items.len() + 1].
        let idx = (pos.max(1) as usize)
            .saturating_sub(1)
            .min(items.len());
        items.insert(idx, item);
    }

    Ok(items)
}

#[tauri::command]
async fn search(q: String) -> Result<Vec<VideoItem>, String> {
    Ok(invidious::search(&q).await)
}

#[tauri::command]
async fn related(youtube_id: String, category: String) -> Result<Vec<VideoItem>, String> {
    Ok(invidious::related(&youtube_id, &category).await)
}

#[tauri::command]
async fn video_streams(youtube_id: String) -> Result<Option<StreamInfo>, String> {
    Ok(invidious::video_streams(&youtube_id).await)
}

// ---------- DB: history ----------

#[tauri::command]
fn db_get_history(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<HistoryItem>, String> {
    db::get_history(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_history(state: tauri::State<'_, Arc<AppState>>, item: VideoItem) -> Result<(), String> {
    db::add_history(&state.db, &item).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_clear_history(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    db::clear_history(&state.db).map_err(|e| e.to_string())
}

// ---------- DB: downloads ----------

#[tauri::command]
fn db_get_downloads(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<DownloadItem>, String> {
    db::get_downloads(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_download(
    state: tauri::State<'_, Arc<AppState>>,
    item: serde_json::Value,
) -> Result<DownloadItem, String> {
    // The frontend passes the VideoItem + quality + sizeMb.
    let quality = item
        .get("quality")
        .and_then(|v| v.as_str())
        .unwrap_or("1080p")
        .to_string();
    let size_mb = item
        .get("sizeMb")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let video: VideoItem =
        serde_json::from_value(item).map_err(|e| format!("invalid video payload: {}", e))?;
    db::add_download(&state.db, &video, &quality, size_mb).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_update_download(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    patch: DownloadPatch,
) -> Result<(), String> {
    db::update_download(&state.db, &id, &patch).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_remove_download(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    db::remove_download(&state.db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_clear_downloads(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    db::clear_downloads(&state.db).map_err(|e| e.to_string())
}

// ---------- DB: liked ----------

#[tauri::command]
fn db_get_liked(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<VideoItem>, String> {
    db::get_liked(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_toggle_like(state: tauri::State<'_, Arc<AppState>>, item: VideoItem) -> Result<bool, String> {
    db::toggle_like(&state.db, &item).map_err(|e| e.to_string())
}

// ---------- DB: playlists ----------

#[tauri::command]
fn db_get_playlists(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<PlaylistLite>, String> {
    db::get_playlists(&state.db).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_create_playlist(
    state: tauri::State<'_, Arc<AppState>>,
    name: String,
    desc: String,
) -> Result<PlaylistLite, String> {
    let description = if desc.is_empty() { None } else { Some(desc.as_str()) };
    db::create_playlist(&state.db, &name, description).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_to_playlist(
    state: tauri::State<'_, Arc<AppState>>,
    playlist_id: String,
    item: VideoItem,
) -> Result<(), String> {
    db::add_to_playlist(&state.db, &playlist_id, &item).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_playlist(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    db::delete_playlist(&state.db, &id).map_err(|e| e.to_string())
}

// ---------- DB: promoted videos ----------

#[tauri::command]
fn db_get_promoted(
    state: tauri::State<'_, Arc<AppState>>,
    category: String,
) -> Result<Vec<PromotedVideo>, String> {
    db::get_promoted(&state.db, &category).map_err(|e| e.to_string())
}

#[tauri::command]
fn db_add_promoted(
    state: tauri::State<'_, Arc<AppState>>,
    youtube_id: String,
    title: String,
    channel: String,
    thumbnail: String,
    duration: i64,
    position: i64,
    label: String,
    category: String,
) -> Result<PromotedVideo, String> {
    db::add_promoted(
        &state.db,
        &youtube_id,
        &title,
        &channel,
        &thumbnail,
        duration,
        position,
        &label,
        &category,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn db_update_promoted(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    position: Option<i64>,
    label: Option<String>,
    active: Option<bool>,
) -> Result<(), String> {
    db::update_promoted(&state.db, &id, position, label.as_deref(), active)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn db_delete_promoted(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    db::delete_promoted(&state.db, &id).map_err(|e| e.to_string())
}

// ---------- VPN commands ----------

#[tauri::command]
fn vpn_connect(state: tauri::State<'_, Arc<AppState>>, server_id: String) -> Result<VpnStatusResponse, String> {
    let server = vpn::find_server(&server_id)
        .ok_or_else(|| format!("unknown server: {}", server_id))?;
    state.vpn.connect(&server)
}

#[tauri::command]
fn vpn_disconnect(state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    state.vpn.disconnect()
}

#[tauri::command]
fn vpn_status(state: tauri::State<'_, Arc<AppState>>) -> VpnStatusResponse {
    state.vpn.status()
}

#[tauri::command]
fn vpn_servers() -> Vec<VpnServer> {
    vpn::VPN_SERVERS.clone()
}

// ---------- App entry ----------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init()
        .ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .setup(|app| {
            // Resolve the app data dir and open the SQLite DB there.
            let app_data = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app_data_dir");
            let db_path = app_data.join("puretuber.db");
            log::info!("SQLite DB at: {}", db_path.display());
            let db = db::open(&db_path).expect("failed to open SQLite DB");

            let state = Arc::new(AppState {
                db,
                vpn: vpn::default_handle(),
            });
            app.manage(state);

            // On Android: register the WireGuard plugin here once its JNI
            // bridge is implemented. e.g.
            //   .plugin(puretuber_wireguard::init())
            //
            // The AppAuth OAuth plugin (for native Google sign-in) would also
            // be registered here when targeting mobile. Until then,
            // `oauth_sign_in` returns a stub error and the frontend falls
            // back to the web-app NextAuth flow or simulated login.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Invidious
            trending,
            search,
            related,
            video_streams,
            // History
            db_get_history,
            db_add_history,
            db_clear_history,
            // Downloads
            db_get_downloads,
            db_add_download,
            db_update_download,
            db_remove_download,
            db_clear_downloads,
            // Liked
            db_get_liked,
            db_toggle_like,
            // Playlists
            db_get_playlists,
            db_create_playlist,
            db_add_to_playlist,
            db_delete_playlist,
            // Promoted
            db_get_promoted,
            db_add_promoted,
            db_update_promoted,
            db_delete_promoted,
            // VPN
            vpn_connect,
            vpn_disconnect,
            vpn_status,
            vpn_servers,
            // OAuth (native Google sign-in + YouTube Data API)
            auth::oauth_sign_in,
            auth::oauth_sign_out,
            auth::oauth_get_session,
            auth::oauth_get_youtube_liked,
            auth::oauth_get_youtube_subscriptions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Look On");
}
