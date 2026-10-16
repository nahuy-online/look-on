// PureTuber VPN — Tauri 2.0 backend entry point.
//
// Registers:
//   - HTTP plugin (so the frontend can `fetch` Invidious directly if needed)
//   - SQL plugin (so the frontend can talk to SQLite directly if we ever
//     expose it; the Rust side uses `rusqlite` directly for now)
//   - All `#[tauri::command]` functions
//
// On Android, the WireGuard plugin would be registered here too once its JNI
// bridge is implemented (see `android-plugins/wireguard/src/lib.rs`).

mod db;
mod invidious;
mod models;
mod vpn;

use std::sync::Arc;

use models::{
    DownloadItem, DownloadPatch, HistoryItem, PlaylistLite, StreamInfo, VideoItem, VpnServer,
    VpnStatusResponse,
};
use tauri::Manager;
use vpn::VpnHandle;

/// Tauri-managed state: SQLite connection + VPN handle.
struct AppState {
    db: db::Db,
    vpn: Box<dyn VpnHandle>,
}

// ---------- Invidious commands ----------

#[tauri::command]
async fn trending(category: String) -> Result<Vec<VideoItem>, String> {
    Ok(invidious::trending(&category).await)
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
            // VPN
            vpn_connect,
            vpn_disconnect,
            vpn_status,
            vpn_servers,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PureTuber VPN");
}
