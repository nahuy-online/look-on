// PureTuber WireGuard Tauri plugin — Android bridge.
//
// This plugin exposes the Kotlin `WireGuardPlugin` (in `android/`) to Rust via
// Tauri commands. On Android, `start_vpn` calls into the Kotlin side using
// `tauri::AppHandle::invoke_java_method` (or by registering a custom Rust
// command that uses the `jni` crate to find the Kotlin class).
//
// On non-Android platforms, all commands return an error so the app falls
// back to the simulated handle in `vpn/mod.rs`.
//
// Register from `src-tauri/src/lib.rs` with:
//   .plugin(puretuber_wireguard::init())
//
// Then the frontend (or Rust backend) can call:
//   invoke("plugin:wireguard|start_vpn", { config: "..." })
//   invoke("plugin:wireguard|stop_vpn")
//   invoke("plugin:wireguard|get_status")

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct WgStatus {
    pub connected: bool,
    pub exit_ip: String,
    pub error: Option<String>,
}

#[derive(Default)]
struct WgState {
    /// Last config that was started (so we can detect a switch).
    last_config: Mutex<Option<String>>,
}

/// Start the VPN tunnel by passing a wg-quick config string to the Kotlin
/// `WireGuardPlugin.startVpn(config: String)`.
#[tauri::command]
async fn start_vpn<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, WgState>,
    config: String,
) -> Result<WgStatus, String> {
    if config.trim().is_empty() {
        return Err("empty WireGuard config".into());
    }
    *state.last_config.lock().unwrap() = Some(config.clone());

    #[cfg(target_os = "android")]
    {
        return invoke_android_start_vpn(&_app, &config).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        // Non-Android: no real backend. The simulated handle in `vpn/mod.rs`
        // is used instead.
        return Err("WireGuard plugin only runs on Android".into());
    }
}

/// Stop the tunnel.
#[tauri::command]
async fn stop_vpn<R: Runtime>(
    _app: tauri::AppHandle<R>,
    state: tauri::State<'_, WgState>,
) -> Result<(), String> {
    *state.last_config.lock().unwrap() = None;

    #[cfg(target_os = "android")]
    {
        return invoke_android_stop_vpn(&_app).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        return Ok(());
    }
}

/// Current status from the Kotlin side.
#[tauri::command]
async fn get_status<R: Runtime>(_app: tauri::AppHandle<R>) -> Result<WgStatus, String> {
    #[cfg(target_os = "android")]
    {
        return invoke_android_status(&_app).await;
    }
    #[cfg(not(target_os = "android"))]
    {
        return Ok(WgStatus::default());
    }
}

// ---------- Android JNI bridge ----------

#[cfg(target_os = "android")]
async fn invoke_android_start_vpn<R: Runtime>(
    app: &tauri::AppHandle<R>,
    config: &str,
) -> Result<WgStatus, String> {
    // The Tauri 2 plugin system lets Rust invoke Kotlin methods registered on
    // the AppHandle. See the `WireGuardPlugin.kt` for the Kotlin handler.
    //
    // TODO: replace the placeholder below with a real `jni` call:
    //   1. Attach the current thread to the JVM with `app.jni_env()`.
    //   2. Find the class `com/puretuber/wireguard/WireGuardPlugin`.
    //   3. Call its `startVpn(Ljava/lang/String;)Lcom/puretuber/wireguard/Status;`
    //      static method.
    //   4. Convert the returned `Status` Kotlin data class to `WgStatus`.
    //
    // For now we log and return an error so the simulated backend takes over.
    let _ = (app, config);
    log::warn!("puretuber-wireguard: start_vpn JNI bridge not implemented; using simulated backend");
    Err("WireGuard JNI bridge not implemented in this scaffold".into())
}

#[cfg(target_os = "android")]
async fn invoke_android_stop_vpn<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let _ = app;
    log::warn!("puretuber-wireguard: stop_vpn JNI bridge not implemented");
    Ok(())
}

#[cfg(target_os = "android")]
async fn invoke_android_status<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<WgStatus, String> {
    let _ = app;
    Ok(WgStatus::default())
}

/// Build and return the WireGuard Tauri plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("wireguard")
        .invoke_handler(tauri::generate_handler![start_vpn, stop_vpn, get_status])
        .setup(|app, _api| {
            app.manage(WgState::default());
            Ok(())
        })
        .build()
}
