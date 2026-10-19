// Look On Player — Tauri 2.0 Android plugin.
//
// Exposes native ExoPlayer playback (ad-free, 3× speed, reliable play/pause via
// `setPlayWhenReady`) and a hidden-WebView YouTube attestation path that
// retrieves the InnerTube API key, visitor data and (optionally) a PO token.
//
// THE FIX for the Obereg bug: play/pause is controlled via ExoPlayer's
// `setPlayWhenReady(true/false)` directly from Rust → JNI → Kotlin — NOT via
// JavaScript evaluation in a WebView. `setPlayWhenReady` is synchronous and
// reliable; the Obereg JavaScript-bridge approach occasionally dropped events.
//
// Register from `src-tauri/src/lib.rs` with:
//   .plugin(look_on_player_lib::init())
//
// Then the frontend calls:
//   invoke("plugin:player|player_init")
//   invoke("plugin:player|player_load", { url, headers, audioUrl? })
//   invoke("plugin:player|player_play")           // ← THE FIX
//   invoke("plugin:player|player_pause")          // ← THE FIX
//   invoke("plugin:player|player_seek_to", { positionMs })
//   invoke("plugin:player|player_set_speed", { speed })   // up to 3.0
//   invoke("plugin:player|player_get_position")   // → i64 (ms)
//   invoke("plugin:player|player_get_duration")   // → i64 (ms)
//   invoke("plugin:player|player_set_viewport", { x, y, width, height })
//   invoke("plugin:player|player_release")
//   invoke("plugin:player|attestation_get_token", { videoId })  // → String (JSON)

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

// ---------- shared DTOs ----------

/// Rect passed from the React `PlayerView` so the Kotlin side can position the
/// `PlayerView` overlay over the placeholder div. Coordinates are in device
/// pixels relative to the Activity's content view. Kept as a public type so a
/// future Rust-side consumer (e.g. a `tauri::Emitter` event bridge) can use it
/// without re-defining the shape.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Viewport {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// Result of `player_load` — surfaces the resolved media URL back to the
/// frontend so the UI can show a loading spinner until the player buffers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub ok: bool,
    pub error: Option<String>,
}

// ---------- Tauri commands ----------
//
// Each command is a thin Rust shim that delegates to the Kotlin singleton
// `ExoPlayerManager` / `AttestationWebView` via JNI on Android. On non-Android
// targets every command returns an error so the frontend can fall back to a
// HTML5 `<video>` element or the YouTube IFrame API.

#[tauri::command]
async fn player_init<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "init", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(())
    }
}

#[tauri::command]
async fn player_load<R: Runtime>(
    _app: AppHandle<R>,
    url: String,
    headers: HashMap<String, String>,
    audio_url: Option<String>,
) -> Result<LoadResult, String> {
    if url.trim().is_empty() {
        return Err("empty url".into());
    }
    #[cfg(target_os = "android")]
    {
        return jni_call_load(&url, &headers, audio_url.as_deref()).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (_app, headers, audio_url);
        log::warn!("look-on-player: player_load is a no-op on non-Android (url={})", url);
        Ok(LoadResult { ok: true, error: None })
    }
}

/// **THE FIX for the Obereg play/pause bug.**
///
/// Calls `ExoPlayer.setPlayWhenReady(true)` synchronously via JNI. Unlike the
/// Obereg approach (which posted a `player.playVideo()` call into a WebView and
/// occasionally dropped it), `setPlayWhenReady` is a direct native method call
/// that takes effect immediately and never gets lost.
#[tauri::command]
async fn player_play<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "play", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(())
    }
}

/// Same as `player_play` but `setPlayWhenReady(false)`. Synchronous + reliable.
#[tauri::command]
async fn player_pause<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "pause", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(())
    }
}

#[tauri::command]
async fn player_seek_to<R: Runtime>(_app: AppHandle<R>, position_ms: i64) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_seek(position_ms).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (_app, position_ms);
        Ok(())
    }
}

/// `setPlaybackParameters(PlaybackParameters(speed))`. Supports up to 3.0×
/// (ExoPlayer clamps internally; values > 3.0 are not pitch-corrected).
#[tauri::command]
async fn player_set_speed<R: Runtime>(_app: AppHandle<R>, speed: f64) -> Result<(), String> {
    let s = speed as f32;
    if !s.is_finite() || s <= 0.0 {
        return Err(format!("invalid speed: {}", speed));
    }
    #[cfg(target_os = "android")]
    {
        return jni_call_speed(s).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (_app, s);
        Ok(())
    }
}

#[tauri::command]
async fn player_get_position<R: Runtime>(_app: AppHandle<R>) -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_long("com/lookon/player/ExoPlayerManager", "getPosition", "()J").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(0)
    }
}

#[tauri::command]
async fn player_get_duration<R: Runtime>(_app: AppHandle<R>) -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_long("com/lookon/player/ExoPlayerManager", "getDuration", "()J").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(0)
    }
}

#[tauri::command]
async fn player_set_viewport<R: Runtime>(
    _app: AppHandle<R>,
    x: f32,
    y: f32,
    width: f32,
    height: f32,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_viewport(x, y, width, height).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (_app, x, y, width, height);
        Ok(())
    }
}

#[tauri::command]
async fn player_release<R: Runtime>(_app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "release", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = _app;
        Ok(())
    }
}

/// Fetch the YouTube InnerTube API key + visitor data (+ optional PO token)
/// for `video_id` by loading `https://www.youtube.com/embed/<video_id>` in a
/// hidden WebView and extracting the values via `evaluateJavascript`.
///
/// Returns a JSON string: `{"apiKey": "...", "visitorData": "...", "poToken": null}`.
/// The frontend forwards `poToken` (when non-null) to `yt_extract` so the WEB
/// client profile can attach it as `serviceIntegrityDimensions.poToken`.
#[tauri::command]
async fn attestation_get_token<R: Runtime>(
    _app: AppHandle<R>,
    video_id: String,
) -> Result<String, String> {
    if video_id.trim().is_empty() {
        return Err("empty videoId".into());
    }
    #[cfg(target_os = "android")]
    {
        // The Kotlin `AttestationWebView.getToken` blocks until the hidden
        // WebView finishes loading + JS evaluation completes (or 15 s timeout).
        // Run on a blocking thread so we don't stall the Tauri async runtime.
        let vid = video_id.clone();
        return tauri::async_runtime::spawn_blocking(move || {
            jni_call_attestation_blocking(&vid)
        })
        .await
        .map_err(|e| format!("join error: {e}"))?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (_app, video_id);
        // Non-Android: return an empty token; the VISIONOS profile works
        // without one. The Rust `yt_extract` command will still succeed.
        Ok(r#"{"apiKey":"","visitorData":"","poToken":null}"#.to_string())
    }
}

// ---------- Android JNI bridge ----------

#[cfg(target_os = "android")]
async fn jni_call_void(class: &str, method: &str, sig: &str) -> Result<(), String> {
    let class = class.to_string();
    let method = method.to_string();
    let sig = sig.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env.find_class(&class).map_err(|e| format!("find_class {class}: {e}"))?;
            env.call_static_method(cls, &method, &sig, &[])
                .map_err(|e| format!("call {method}: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_long(class: &str, method: &str, sig: &str) -> Result<i64, String> {
    let class = class.to_string();
    let method = method.to_string();
    let sig = sig.to_string();
    tauri::async_runtime::spawn_blocking(move || -> Result<i64, String> {
        with_env(|env| {
            let cls = env.find_class(&class).map_err(|e| format!("find_class {class}: {e}"))?;
            let v = env
                .call_static_method(cls, &method, &sig, &[])
                .map_err(|e| format!("call {method}: {e}"))?;
            let j = v.j().map_err(|e| format!("cast long: {e}"))?;
            Ok(j as i64)
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_load(
    url: &str,
    headers: &HashMap<String, String>,
    audio_url: Option<&str>,
) -> Result<LoadResult, String> {
    // Serialize the args to JSON and pass a single String to Kotlin — far
    // simpler than building a `java.util.HashMap` via JNI from Rust.
    let payload = serde_json::json!({
        "url": url,
        "headers": headers,
        "audioUrl": audio_url,
    })
    .to_string();
    let json = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        jni_call_string_blocking(
            "com/lookon/player/ExoPlayerManager",
            "loadJson",
            "(Ljava/lang/String;)Ljava/lang/String;",
            &payload,
        )
    })
    .await
    .map_err(|e| format!("join: {e}"))??;
    let result: LoadResult = serde_json::from_str(&json)
        .map_err(|e| format!("parse Kotlin loadJson response: {e} (raw: {json})"))?;
    Ok(result)
}

#[cfg(target_os = "android")]
async fn jni_call_seek(position_ms: i64) -> Result<(), String> {
    use jni::objects::JValue;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env
                .find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(cls, "seekTo", "(J)V", &[JValue::Long(position_ms)])
                .map_err(|e| format!("call seekTo: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_speed(speed: f32) -> Result<(), String> {
    use jni::objects::JValue;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env
                .find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(cls, "setSpeed", "(F)V", &[JValue::Float(speed)])
                .map_err(|e| format!("call setSpeed: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_viewport(x: f32, y: f32, w: f32, h: f32) -> Result<(), String> {
    use jni::objects::JValue;
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env
                .find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(
                cls,
                "setViewport",
                "(FFFF)V",
                &[
                    JValue::Float(x),
                    JValue::Float(y),
                    JValue::Float(w),
                    JValue::Float(h),
                ],
            )
            .map_err(|e| format!("call setViewport: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
fn jni_call_string_blocking(
    class: &str,
    method: &str,
    sig: &str,
    arg: &str,
) -> Result<String, String> {
    use jni::objects::{JObject, JString, JValue};
    with_env(|env| {
        let cls = env.find_class(class).map_err(|e| format!("find_class {class}: {e}"))?;
        let jstr = env
            .new_string(arg)
            .map_err(|e| format!("new_string: {e}"))?;
        // Bind the JObject to a local so the borrow passed to JValue::Object
        // lives for the duration of the call_static_method call. (Using
        // `&jstr.into()` directly would drop the temporary too early.)
        let jobj: JObject = jstr.into();
        let val = env
            .call_static_method(cls, method, sig, &[JValue::Object(&jobj)])
            .map_err(|e| format!("call {method}: {e}"))?;
        let obj: JObject = val.l().map_err(|e| format!("cast obj: {e}"))?;
        if obj.is_null() {
            return Ok(String::new());
        }
        let jstr2: JString = obj.into();
        let s: String = env
            .get_string(&jstr2)
            .map_err(|e| format!("get_string: {e}"))?
            .into();
        Ok(s)
    })
}

#[cfg(target_os = "android")]
fn jni_call_attestation_blocking(video_id: &str) -> Result<String, String> {
    jni_call_string_blocking(
        "com/lookon/player/AttestationWebView",
        "getToken",
        "(Ljava/lang/String;)Ljava/lang/String;",
        video_id,
    )
}

/// Attach the current thread to the JVM and run `f` with the JNIEnv.
///
/// Uses `ndk_context::android_context()` to find the JVM that Tauri registers
/// at startup. Returns an error if the JVM isn't available (which happens when
/// the plugin is invoked before the Android app is fully initialised —
/// practically never for `player_init` because the frontend only calls it after
/// the WebView mounts).
#[cfg(target_os = "android")]
fn with_env<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut jni::JNIEnv) -> Result<R, String>,
{
    let ctx = ndk_context::android_context();
    let vm_ptr = ctx.vm().ok_or_else(|| "no JVM in ndk_context".to_string())?;
    let vm = unsafe { jni::JavaVM::from_raw(vm_ptr) }
        .map_err(|e| format!("JavaVM::from_raw: {e}"))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach_current_thread: {e}"))?;
    f(&mut env)
}

// ---------- plugin entry ----------

/// Build and return the Player Tauri plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("player")
        .invoke_handler(tauri::generate_handler![
            player_init,
            player_load,
            player_play,
            player_pause,
            player_seek_to,
            player_set_speed,
            player_get_position,
            player_get_duration,
            player_set_viewport,
            player_release,
            attestation_get_token,
        ])
        .setup(|_app, _api| {
            log::info!("look-on-player plugin initialised");
            Ok(())
        })
        .build()
}
