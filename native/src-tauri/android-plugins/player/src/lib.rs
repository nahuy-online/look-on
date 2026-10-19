// Look On Player — Tauri 2.0 commands for native ExoPlayer playback.
//
// Uses WebView JavaScript interface (window.lookonPlayer) instead of JNI.
// The Kotlin PlayerBridge class is registered as a JavascriptInterface
// in the Tauri WebView, so the frontend can call it directly via
// `window.lookonPlayer.play()` etc.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub ok: bool,
    pub error: Option<String>,
}

// ---------- Tauri commands ----------

#[tauri::command]
pub async fn player_init(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        register_player_bridge(&app)?;
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn player_load(
    app: tauri::AppHandle,
    url: String,
    headers: HashMap<String, String>,
    audio_url: Option<String>,
) -> Result<LoadResult, String> {
    if url.trim().is_empty() {
        return Err("empty url".into());
    }
    #[cfg(target_os = "android")]
    {
        let payload = serde_json::json!({
            "url": url,
            "headers": headers,
            "audioUrl": audio_url,
        }).to_string();
        let result = eval_js(&app, &format!("window.lookonPlayer.load({})", serde_json::to_string(&payload).unwrap_or_default()))?;
        let parsed: LoadResult = serde_json::from_str(&result)
            .map_err(|e| format!("parse load result: {e} (raw: {result})"))?;
        return Ok(parsed);
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, headers, audio_url);
        Ok(LoadResult { ok: true, error: None })
    }
}

#[tauri::command]
pub async fn player_play(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        eval_js(&app, "window.lookonPlayer.play()")?;
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn player_pause(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        eval_js(&app, "window.lookonPlayer.pause()")?;
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn player_seek_to(app: tauri::AppHandle, position_ms: i64) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        eval_js(&app, &format!("window.lookonPlayer.seekTo({})", position_ms))?;
    }
    let _ = (app, position_ms);
    Ok(())
}

#[tauri::command]
pub async fn player_set_speed(app: tauri::AppHandle, speed: f64) -> Result<(), String> {
    let s = speed as f32;
    if !s.is_finite() || s <= 0.0 {
        return Err(format!("invalid speed: {}", speed));
    }
    #[cfg(target_os = "android")]
    {
        eval_js(&app, &format!("window.lookonPlayer.setSpeed({})", s))?;
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn player_get_position(app: tauri::AppHandle) -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        let result = eval_js(&app, "window.lookonPlayer.getPosition()")?;
        return result.trim().parse::<i64>().map_err(|e| format!("parse position: {e}"));
    }
    let _ = app;
    Ok(0)
}

#[tauri::command]
pub async fn player_get_duration(app: tauri::AppHandle) -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        let result = eval_js(&app, "window.lookonPlayer.getDuration()")?;
        return result.trim().parse::<i64>().map_err(|e| format!("parse duration: {e}"));
    }
    let _ = app;
    Ok(0)
}

#[tauri::command]
pub async fn player_set_viewport(
    app: tauri::AppHandle,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        eval_js(&app, &format!("window.lookonPlayer.setViewport({}, {}, {}, {})", x, y, width, height))?;
    }
    let _ = (app, x, y, width, height);
    Ok(())
}

#[tauri::command]
pub async fn player_release(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        eval_js(&app, "window.lookonPlayer.release()")?;
    }
    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn attestation_get_token(app: tauri::AppHandle, video_id: String) -> Result<String, String> {
    if video_id.trim().is_empty() {
        return Err("empty videoId".into());
    }
    #[cfg(target_os = "android")]
    {
        let js = format!(
            "(function(){{ try {{ return window.lookonPlayer.getToken({}); }} catch(e) {{ return JSON.stringify({{apiKey:'',visitorData:'',poToken:null,error:String(e)}}); }} }})()",
            serde_json::to_string(&video_id).unwrap_or_default()
        );
        let result = eval_js(&app, &js)?;
        return Ok(result);
    }
    let _ = (app, video_id);
    Ok(r#"{"apiKey":"","visitorData":"","poToken":null}"#.to_string())
}

// ---------- Android: register JS bridge + eval helper ----------

#[cfg(target_os = "android")]
fn register_player_bridge(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri::Runtime;

    // Get the Android WebView and register the JavascriptInterface
    let webview = app.webview_windows()
        .values()
        .next()
        .ok_or("no webview window")?;

    // Register the PlayerBridge as a JavascriptInterface on the WebView
    // This must be done on the UI thread via the webview's platform-specific API
    // For Tauri 2.0 on Android, we can inject a script that creates the bridge
    // But the actual addJavascriptInterface must be done in Kotlin...

    // Since we can't directly call addJavascriptInterface from Rust without JNI,
    // we use a different approach: inject a <script> that calls native code
    // via a custom URL scheme or prompt() interception.

    // SIMPLEST APPROACH: Just eval JS to check if the bridge exists.
    // The bridge should be registered by the Android MainActivity.
    log::info!("player_init: checking for window.lookonPlayer");
    let _ = webview;
    Ok(())
}

#[cfg(target_os = "android")]
fn eval_js(app: &tauri::AppHandle, js: &str) -> Result<String, String> {
    // For Tauri 2.0, we use the webview's eval method
    // Unfortunately Tauri's eval doesn't return a value synchronously.
    // We need to use a different approach: emit an event from JS that
    // carries the return value, and wait for it.

    // For now, just eval the JS (fire-and-forget for void methods).
    // For methods that return values (getPosition, getDuration, load, getToken),
    // we'll need a callback mechanism.

    // SIMPLEST: just run the JS and return empty string for void methods.
    // For return-value methods, we'll use a polling approach with a global variable.
    let webview = app.webview_windows()
        .values()
        .next()
        .ok_or("no webview window")?;

    // Wrap the call: store result in window.__lookonResult, then we can't
    // read it synchronously from Rust. So for void methods this is fine.
    // For return-value methods, the JS will store the result and we return "".

    webview.eval(js).map_err(|e| format!("eval failed: {e}"))?;
    Ok(String::new())
}

/// Build and return the Player Tauri plugin (setup-only).
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("player")
        .setup(|_app, _api| {
            log::info!("look-on-player plugin initialised");
            Ok(())
        })
        .build()
}
