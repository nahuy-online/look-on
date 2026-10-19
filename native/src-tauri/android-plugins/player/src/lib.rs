// Look On Player — Tauri 2.0 commands for native ExoPlayer playback.
//
// Exposes native ExoPlayer playback (ad-free, 3× speed, reliable play/pause via
// `setPlayWhenReady`) and a hidden-WebView YouTube attestation path.
//
// THE FIX for the Obereg bug: play/pause is controlled via ExoPlayer's
// `setPlayWhenReady(true/false)` directly from Rust → JNI → Kotlin — NOT via
// JavaScript evaluation in a WebView.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

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

// ---------- Tauri commands (registered in main invoke_handler) ----------

#[tauri::command]
pub async fn player_init() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "init", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn player_load(
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
        let _ = (headers, audio_url);
        log::warn!("player_load is a no-op on non-Android (url={})", url);
        Ok(LoadResult { ok: true, error: None })
    }
}

#[tauri::command]
pub async fn player_play() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "play", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn player_pause() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "pause", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn player_seek_to(position_ms: i64) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_seek(position_ms).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = position_ms;
        Ok(())
    }
}

#[tauri::command]
pub async fn player_set_speed(speed: f64) -> Result<(), String> {
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
        Ok(())
    }
}

#[tauri::command]
pub async fn player_get_position() -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_long("com/lookon/player/ExoPlayerManager", "getPosition", "()J").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(0)
    }
}

#[tauri::command]
pub async fn player_get_duration() -> Result<i64, String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_long("com/lookon/player/ExoPlayerManager", "getDuration", "()J").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(0)
    }
}

#[tauri::command]
pub async fn player_set_viewport(
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
        Ok(())
    }
}

#[tauri::command]
pub async fn player_release() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        return jni_call_void("com/lookon/player/ExoPlayerManager", "release", "()V").await;
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn attestation_get_token(video_id: String) -> Result<String, String> {
    if video_id.trim().is_empty() {
        return Err("empty videoId".into());
    }
    #[cfg(target_os = "android")]
    {
        let vid = video_id.clone();
        return tauri::async_runtime::spawn_blocking(move || {
            jni_call_attestation_blocking(&vid)
        })
        .await
        .map_err(|e| format!("join error: {e}"))?;
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = video_id;
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
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env.find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(cls, "seekTo", "(J)V", &[jni::objects::JValue::Long(position_ms)])
                .map_err(|e| format!("call seekTo: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_speed(speed: f32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env.find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(cls, "setSpeed", "(F)V", &[jni::objects::JValue::Float(speed)])
                .map_err(|e| format!("call setSpeed: {e}"))?;
            Ok(())
        })
    })
    .await
    .map_err(|e| format!("join: {e}"))?
}

#[cfg(target_os = "android")]
async fn jni_call_viewport(x: f32, y: f32, w: f32, h: f32) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        with_env(|env| {
            let cls = env.find_class("com/lookon/player/ExoPlayerManager")
                .map_err(|e| format!("find_class: {e}"))?;
            env.call_static_method(
                cls,
                "setViewport",
                "(FFFF)V",
                &[
                    jni::objects::JValue::Float(x),
                    jni::objects::JValue::Float(y),
                    jni::objects::JValue::Float(w),
                    jni::objects::JValue::Float(h),
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
    use jni::objects::JValue;
    with_env(|env| {
        let cls = env
            .find_class(class)
            .map_err(|e| format!("find_class {class}: {e}"))?;
        let jstr = env
            .new_string(arg)
            .map_err(|e| format!("new_string: {e}"))?;
        let val = env
            .call_static_method(cls, method, sig, &[JValue::Object(&jstr.into())])
            .map_err(|e| format!("call {method}: {e}"))?;
        let jobj = val.l().map_err(|e| format!("cast object: {e}"))?;
        let jstr = jobj.into_inner();
        let rust_string: String = env
            .get_string(&jni::objects::JString::from(jstr))
            .map_err(|e| format!("get_string: {e}"))?
            .into();
        Ok(rust_string)
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

#[cfg(target_os = "android")]
fn with_env<F, R>(f: F) -> Result<R, String>
where
    F: FnOnce(&mut jni::JNIEnv) -> Result<R, String>,
{
    let ctx = ndk_context::android_context();
    let vm_ptr = ctx.vm();
    if vm_ptr.is_null() {
        return Err("no JVM in ndk_context".to_string());
    }
    let vm = unsafe { jni::JavaVM::from_raw(vm_ptr as *mut jni::sys::JavaVM) }
        .map_err(|e| format!("JavaVM::from_raw: {e}"))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("attach_current_thread: {e}"))?;
    f(&mut env)
}

/// Build and return the Player Tauri plugin (setup-only, no commands registered here).
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("player")
        .setup(|_app, _api| {
            log::info!("look-on-player plugin initialised");
            Ok(())
        })
        .build()
}
