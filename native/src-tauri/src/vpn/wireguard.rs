// WireGuard config builder + (optional) userspace tunnel handle.
//
// The `build_wg_config` function generates a wg-quick-style config text from
// the server endpoint + peer public key + client private key. This config is
// what the Android `VpnService` plugin consumes (after being parsed by the
// `wireguard-android` library, or our hand-rolled parser in
// `android-plugins/wireguard/android/.../WireGuardPlugin.kt`).
//
// On desktop, you can wire up the `boringtun` crate (declared in Cargo.toml
// under the `desktop-wg` feature) to actually run the tunnel. We provide a
// stub `BoringTunHandle` showing where that integration would go.

use crate::models::{VpnServer, VpnStatusResponse};
use crate::vpn::VpnHandle;

/// Server-side credentials required to bring up a real WireGuard tunnel.
/// You must supply these yourself — this scaffold does NOT include real
/// server keys.
pub struct WgServerCreds {
    /// e.g. "vpn.example.com:51820"
    pub endpoint: String,
    /// Server's public key (base64).
    pub peer_public_key: String,
    /// Client's private key (base64). Generate with `wg genkey`.
    pub client_private_key: String,
    /// Client IP inside the tunnel, e.g. "10.8.0.2/32".
    pub client_address: String,
    /// DNS server to push, e.g. "1.1.1.1".
    pub dns: String,
    /// AllowedIPs — typically "0.0.0.0/0, ::/0" for full tunnel.
    pub allowed_ips: String,
}

/// Generate a wg-quick config string from server credentials.
pub fn build_wg_config(creds: &WgServerCreds) -> String {
    format!(
        "[Interface]\n\
         PrivateKey = {priv}\n\
         Address = {addr}\n\
         DNS = {dns}\n\
         \n\
         [Peer]\n\
         PublicKey = {peer_pub}\n\
         Endpoint = {endpoint}\n\
         AllowedIPs = {allowed}\n\
         PersistentKeepalive = 25\n",
        priv = creds.client_private_key,
        addr = creds.client_address,
        dns = creds.dns,
        peer_pub = creds.peer_public_key,
        endpoint = creds.endpoint,
        allowed = creds.allowed_ips,
    )
}

/// Look up server credentials by `VpnServer::id` from a (not-included)
/// secrets file or env var. Returns `None` in this scaffold so the simulated
/// backend is used.
///
/// To enable real WireGuard:
///   1. Deploy a WireGuard server (or use a commercial one).
///   2. Generate a client keypair: `wg genkey | tee priv | wg pubkey > pub`.
///   3. Store the credentials in `~/.config/puretuber/wg-creds/<server-id>.toml`
///      or env vars like `PURETUBER_WG_<SERVER_ID>_ENDPOINT`.
///   4. Implement this lookup and call `build_wg_config` → pass to the
///      Android plugin (or boringtun on desktop).
pub fn server_creds_for(_server: &VpnServer) -> Option<WgServerCreds> {
    // TODO: load from env / config file. None → simulated mode.
    None
}

/// Stub for a userspace boringtun-backed WireGuard handle (desktop only).
///
/// To activate:
///   - Enable the `desktop-wg` Cargo feature.
///   - Add `boringtun = "0.6"` to `Cargo.toml` (already there, optional).
///   - Implement `connect` to spawn a `boringtun::Device` task on a tokio
///     runtime, hook up a TUN interface (via `tun` crate), and track stats
///     from the device's `poll` API.
///
/// Until then, the simulated handle is used on desktop.
#[allow(dead_code)]
pub struct BoringTunHandle;

#[allow(dead_code)]
impl BoringTunHandle {
    pub fn new() -> Self {
        BoringTunHandle
    }
}

impl VpnHandle for BoringTunHandle {
    fn is_real(&self) -> bool {
        true
    }

    fn connect(&self, _server: &VpnServer) -> Result<VpnStatusResponse, String> {
        // TODO: bring up the boringtun device here.
        Err("BoringTunHandle not implemented. Supply server creds and finish the integration.".into())
    }

    fn disconnect(&self) -> Result<(), String> {
        Ok(())
    }

    fn status(&self) -> VpnStatusResponse {
        VpnStatusResponse::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_wg_config() {
        let creds = WgServerCreds {
            endpoint: "vpn.example.com:51820".into(),
            peer_public_key: "PEERPUBKEYBASE64".into(),
            client_private_key: "CLIENTPRIVKEYBASE64".into(),
            client_address: "10.8.0.2/32".into(),
            dns: "1.1.1.1".into(),
            allowed_ips: "0.0.0.0/0, ::/0".into(),
        };
        let cfg = build_wg_config(&creds);
        assert!(cfg.contains("[Interface]"));
        assert!(cfg.contains("PrivateKey = CLIENTPRIVKEYBASE64"));
        assert!(cfg.contains("[Peer]"));
        assert!(cfg.contains("Endpoint = vpn.example.com:51820"));
        assert!(cfg.contains("PersistentKeepalive = 25"));
    }
}
