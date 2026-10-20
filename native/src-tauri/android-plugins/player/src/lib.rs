// Look On Player — Tauri 2.0 plugin (setup-only, no commands).
//
// The frontend calls window.lookonPlayer.* directly (registered as a
// @JavascriptInterface in MainActivity). No Rust commands needed.

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("player")
        .setup(|_app, _api| {
            log::info!("look-on-player plugin initialised");
            Ok(())
        })
        .build()
}
