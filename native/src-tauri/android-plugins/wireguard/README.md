# PureTuber WireGuard Android Plugin

This folder is a **Tauri 2.0 mobile plugin scaffold** for bridging Rust ↔
Android `VpnService` so the PureTuber VPN app can bring up a real WireGuard
tunnel on Android.

## Layout

```
wireguard/
├── Cargo.toml                       # Rust crate (puretuber-wireguard)
├── src/lib.rs                       # Tauri plugin: start_vpn / stop_vpn / get_status
└── android/
    ├── build.gradle.kts             # Android library module
    └── src/main/
        ├── AndroidManifest.xml      # <service> declaration + BIND_VPN_SERVICE
        └── java/com/puretuber/wireguard/
            ├── WireGuardPlugin.kt   # entry: startVpn(config), stopVpn(), getStatus()
            └── WireGuardVpnService.kt  # foreground VpnService owning the TUN FD
```

## How the integration works

1. The Rust backend (`src-tauri/src/vpn/wireguard.rs`) builds a wg-quick config
   string from server credentials (endpoint + peer public key + client private
   key).
2. The Rust Tauri plugin (`src/lib.rs` here) exposes `start_vpn(config)` /
   `stop_vpn()` / `get_status()` as Tauri commands.
3. On Android, `start_vpn` calls into the Kotlin `WireGuardPlugin.startVpn()`
   via JNI (the Rust side currently has a TODO stub — wire it up by attaching
   to the JVM and calling the Kotlin method).
4. `WireGuardPlugin.startVpn()` first ensures the user has granted VPN
   permission by calling `VpnService.prepare(context)`. If it returns a non-null
   Intent, the Activity must launch it (system "Allow VPN connection?" dialog).
5. After permission, the plugin starts `WireGuardVpnService` as a **foreground
   service** (required so the OS doesn't kill the tunnel when the app is
   backgrounded). The service calls `VpnService.Builder.establish()` to create
   the TUN file descriptor.
6. The `wireguard-android` `GoBackend` userspace implementation is registered
   with the TUN FD and performs the actual WireGuard handshake. The GoBackend
   is published as `com.wireguard.android:tunnel` (see `build.gradle.kts`).
7. Live stats (bytes up/down, exit IP, session time) are pulled by polling
   `WireGuardPlugin.getStatus()` from Rust every ~1.5 s.

## Permissions required

Declared in `AndroidManifest.xml`:

- `android.permission.INTERNET` — for the WireGuard UDP socket.
- `android.permission.ACCESS_NETWORK_STATE` — to detect network changes.
- `android.permission.FOREGROUND_SERVICE` — to keep the tunnel alive in the
  background.
- `android.permission.FOREGROUND_SERVICE_SPECIAL_USE` + property
  `android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE = "VPN"` — Android 14+.
- `android.permission.POST_NOTIFICATIONS` — to show the foreground service
  notification (Android 13+).
- `android.permission.BIND_VPN_SERVICE` — protects the service so only the
  system can bind to it.

The user must grant the VPN permission via the system dialog. There is **no
way** to pre-grant it silently — this is a deliberate Android security
restriction.

## What you need to bring your own

This scaffold generates WireGuard configs but does **not** include real server
credentials. To actually run a tunnel:

1. **Server-side**: deploy a WireGuard server (or rent one from any VPN
   provider that exposes raw WireGuard configs). You need:
   - Server endpoint (host:port)
   - Server's peer **public key**
2. **Client-side**: generate a keypair on the device (or in your backend):
   ```bash
   wg genkey | tee client-private | wg pubkey > client-public
   ```
   Add the client's public key to the server's `[Peer]` section.
3. **Hand the credentials to the app** via env var, a config file at
   `~/.config/puretuber/wg-creds/<server-id>.toml`, or a remote config
   endpoint. Then implement `vpn::wireguard::server_creds_for()` in
   `src-tauri/src/vpn/wireguard.rs` to return them.

## Why the scaffold is "simulated mode" by default

Because we don't have real server credentials and the JNI bridge from Rust to
Kotlin isn't wired up here, the app falls back to a **simulated** VPN handle
(see `src-tauri/src/vpn/mod.rs`). This is enough to demo the UI end-to-end —
connect orb, live stats, server switching, etc. — but no actual traffic is
tunnelled.

To switch to real mode on Android:

1. Finish the JNI bridge in `src/lib.rs` (replace the `TODO` in
   `invoke_android_start_vpn` with a real `jni::JNIEnv` call to the Kotlin
   `WireGuardPlugin.startVpn`).
2. Implement `vpn::wireguard::server_creds_for()` to return your real
   credentials.
3. In `vpn/mod.rs::default_handle()`, return `Box::new(wireguard::BoringTunHandle::new())`
   or — better — a new `AndroidWireGuardHandle` that delegates to this plugin.
4. Build with `cargo tauri android build`.

## References

- Android `VpnService` docs: https://developer.android.com/reference/android/net/VpnService
- WireGuard for Android: https://git.zx2c4.com/wireguard-android/
- Tauri 2 mobile plugins: https://v2.tauri.app/develop/plugins/
- boringtun (userspace WireGuard in Rust, alternative path for desktop):
  https://github.com/cloudflare/boringtun
