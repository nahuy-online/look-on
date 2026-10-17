// VPN module — abstracts the underlying tunnel backend.
//
// On Android: the real backend is the Kotlin `WireGuardPlugin` which calls
// into Android's `VpnService`. The Rust side of that plugin lives at
// `src-tauri/android-plugins/wireguard/`. When the app is built for Android
// and the plugin is registered, `VpnHandle` delegates connect/disconnect to
// the Kotlin handlers via the plugin's registered Tauri commands.
//
// On other platforms (iOS, Windows, desktop): a `SimulatedHandle` returns
// plausible stats so the UI is demoable. A `BoringTunHandle` (gated behind
// the `desktop-wg` feature) is provided as a starting point for a userspace
// WireGuard tunnel on desktop — see `vpn/wireguard.rs`.

pub mod wireguard;

use crate::models::{VpnServer, VpnStatus, VpnStatusResponse};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Trait every VPN backend must implement.
pub trait VpnHandle: Send + Sync {
    fn connect(&self, server: &VpnServer) -> Result<VpnStatusResponse, String>;
    fn disconnect(&self) -> Result<(), String>;
    fn status(&self) -> VpnStatusResponse;
    /// Whether this backend represents a real WireGuard tunnel (vs simulated).
    fn is_real(&self) -> bool;
}

// ---------- Simulated backend (default on non-Android) ----------

pub struct SimulatedHandle {
    state: Mutex<SimState>,
}

#[derive(Default)]
struct SimState {
    status: VpnStatusKind,
    server: Option<VpnServer>,
    exit_ip: String,
    session_start: Option<i64>,
    last_tick: Option<Instant>,
    data_down: u64,
    data_up: u64,
    speed_down: u64,
    speed_up: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
enum VpnStatusKind {
    #[default]
    Disconnected,
    Connecting,
    Connected,
}

impl SimulatedHandle {
    pub fn new() -> Self {
        SimulatedHandle {
            state: Mutex::new(SimState::default()),
        }
    }
}

impl VpnHandle for SimulatedHandle {
    fn is_real(&self) -> bool {
        false
    }

    fn connect(&self, server: &VpnServer) -> Result<VpnStatusResponse, String> {
        let mut s = self.state.lock().unwrap();
        s.status = VpnStatusKind::Connected;
        s.server = Some(server.clone());
        s.exit_ip = generate_exit_ip(&server.country_code);
        s.session_start = Some(now_millis());
        s.last_tick = Some(Instant::now());
        s.data_down = 0;
        s.data_up = 0;
        s.speed_down = 0;
        s.speed_up = 0;
        Ok(self.snapshot_locked(&s))
    }

    fn disconnect(&self) -> Result<(), String> {
        let mut s = self.state.lock().unwrap();
        s.status = VpnStatusKind::Disconnected;
        s.server = None;
        s.exit_ip = String::new();
        s.session_start = None;
        s.last_tick = None;
        s.speed_down = 0;
        s.speed_up = 0;
        Ok(())
    }

    fn status(&self) -> VpnStatusResponse {
        let mut s = self.state.lock().unwrap();
        if s.status == VpnStatusKind::Connected {
            // Advance simulated byte counters using random speeds.
            let now = Instant::now();
            let elapsed = s
                .last_tick
                .map(|t| now.duration_since(t).as_secs_f64())
                .unwrap_or(0.0);
            if elapsed > 0.0 {
                s.speed_down = crate::invidious::rand_range(1_500_000, 8_000_000);
                s.speed_up = crate::invidious::rand_range(120_000, 600_000);
                s.data_down += (s.speed_down as f64 * elapsed) as u64;
                s.data_up += (s.speed_up as f64 * elapsed) as u64;
            }
            s.last_tick = Some(now);
        }
        self.snapshot_locked(&s)
    }
}

impl SimulatedHandle {
    fn snapshot_locked(&self, s: &SimState) -> VpnStatusResponse {
        VpnStatusResponse {
            status: match s.status {
                VpnStatusKind::Disconnected => VpnStatus::Disconnected,
                VpnStatusKind::Connecting => VpnStatus::Connecting,
                VpnStatusKind::Connected => VpnStatus::Connected,
            },
            server_id: s.server.as_ref().map(|s| s.id.clone()),
            exit_ip: s.exit_ip.clone(),
            download_speed: s.speed_down,
            upload_speed: s.speed_up,
            data_downloaded: s.data_down,
            data_uploaded: s.data_up,
            session_start: s.session_start,
            real: false,
        }
    }
}

// ---------- Backend selector ----------

/// Pick the right backend for the current target. On Android we attempt to
/// load the WireGuard plugin's handle; on other platforms we use the
/// simulated handle.
pub fn default_handle() -> Box<dyn VpnHandle> {
    #[cfg(target_os = "android")]
    {
        // TODO: When the `wireguard` plugin is registered with Tauri, it
        // exposes a `WireGuardHandle` implementing `VpnHandle`. Until the
        // JNI bridge is wired in `android-plugins/wireguard/src/lib.rs`, we
        // still use the simulated handle so the UI is demoable.
        //
        // return Box::new(wireguard::BoringTunHandle::new());
        return Box::new(SimulatedHandle::new());
    }
    #[cfg(not(target_os = "android"))]
    {
        // On desktop / iOS, optionally use the boringtun-backed userspace
        // tunnel when the `desktop-wg` feature is enabled. Otherwise simulate.
        #[cfg(feature = "desktop-wg")]
        {
            // TODO: implement `BoringTunHandle` in `wireguard.rs` once you
            // supply real server credentials (peer pubkey, endpoint, client
            // private key). Until then, fall through to simulated.
            // return Box::new(wireguard::BoringTunHandle::new());
        }
        Box::new(SimulatedHandle::new())
    }
}

// ---------- Helpers ----------

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn generate_exit_ip(country_code: &str) -> String {
    let prefix = match country_code {
        "US" => "104.28",
        "GB" => "185.61",
        "DE" => "193.176",
        "NL" => "89.39",
        "FR" => "51.91",
        "CH" => "194.50",
        "SE" => "46.246",
        "SG" => "103.106",
        "JP" => "154.11",
        "HK" => "45.125",
        "AU" => "103.23",
        "CA" => "192.99",
        "IN" => "103.94",
        "AE" => "91.102",
        "BR" => "179.51",
        "ZA" => "102.130",
        "KR" => "175.45",
        "ES" => "185.93",
        _ => "10.8",
    };
    let mut rng = rand::thread_rng();
    use rand::Rng;
    let a = rng.gen_range(20..220);
    let b = rng.gen_range(5..205);
    format!("{}.{}.{}", prefix, a, b)
}

// Static VPN server catalog (mirrors `vpn-servers.ts` on the frontend).
pub static VPN_SERVERS: Lazy<Vec<VpnServer>> = Lazy::new(|| {
    vec![
        VpnServer { id: "us-nyc".into(), country: "United States".into(), country_code: "US".into(), city: "New York".into(), flag: "🇺🇸".into(), ping: 38, load: 24, premium: false, servers: 1280 },
        VpnServer { id: "us-lax".into(), country: "United States".into(), country_code: "US".into(), city: "Los Angeles".into(), flag: "🇺🇸".into(), ping: 52, load: 31, premium: false, servers: 980 },
        VpnServer { id: "us-mia".into(), country: "United States".into(), country_code: "US".into(), city: "Miami".into(), flag: "🇺🇸".into(), ping: 61, load: 18, premium: true, servers: 640 },
        VpnServer { id: "gb-lon".into(), country: "United Kingdom".into(), country_code: "GB".into(), city: "London".into(), flag: "🇬🇧".into(), ping: 44, load: 27, premium: false, servers: 1120 },
        VpnServer { id: "de-fra".into(), country: "Germany".into(), country_code: "DE".into(), city: "Frankfurt".into(), flag: "🇩🇪".into(), ping: 33, load: 22, premium: false, servers: 1040 },
        VpnServer { id: "nl-ams".into(), country: "Netherlands".into(), country_code: "NL".into(), city: "Amsterdam".into(), flag: "🇳🇱".into(), ping: 35, load: 19, premium: false, servers: 760 },
        VpnServer { id: "fr-par".into(), country: "France".into(), country_code: "FR".into(), city: "Paris".into(), flag: "🇫🇷".into(), ping: 41, load: 26, premium: false, servers: 540 },
        VpnServer { id: "ch-zur".into(), country: "Switzerland".into(), country_code: "CH".into(), city: "Zurich".into(), flag: "🇨🇭".into(), ping: 39, load: 14, premium: true, servers: 320 },
        VpnServer { id: "se-sto".into(), country: "Sweden".into(), country_code: "SE".into(), city: "Stockholm".into(), flag: "🇸🇪".into(), ping: 47, load: 12, premium: true, servers: 280 },
        VpnServer { id: "sg-sin".into(), country: "Singapore".into(), country_code: "SG".into(), city: "Singapore".into(), flag: "🇸🇬".into(), ping: 58, load: 33, premium: false, servers: 690 },
        VpnServer { id: "jp-tok".into(), country: "Japan".into(), country_code: "JP".into(), city: "Tokyo".into(), flag: "🇯🇵".into(), ping: 64, load: 29, premium: false, servers: 820 },
        VpnServer { id: "hk-hkg".into(), country: "Hong Kong".into(), country_code: "HK".into(), city: "Hong Kong".into(), flag: "🇭🇰".into(), ping: 67, load: 41, premium: true, servers: 410 },
        VpnServer { id: "au-syd".into(), country: "Australia".into(), country_code: "AU".into(), city: "Sydney".into(), flag: "🇦🇺".into(), ping: 88, load: 23, premium: false, servers: 530 },
        VpnServer { id: "ca-tor".into(), country: "Canada".into(), country_code: "CA".into(), city: "Toronto".into(), flag: "🇨🇦".into(), ping: 42, load: 20, premium: false, servers: 470 },
        VpnServer { id: "in-mum".into(), country: "India".into(), country_code: "IN".into(), city: "Mumbai".into(), flag: "🇮🇳".into(), ping: 71, load: 36, premium: false, servers: 390 },
        VpnServer { id: "ae-dxb".into(), country: "UAE".into(), country_code: "AE".into(), city: "Dubai".into(), flag: "🇦🇪".into(), ping: 79, load: 28, premium: true, servers: 260 },
        VpnServer { id: "br-sao".into(), country: "Brazil".into(), country_code: "BR".into(), city: "São Paulo".into(), flag: "🇧🇷".into(), ping: 96, load: 34, premium: false, servers: 310 },
        VpnServer { id: "za-jnb".into(), country: "South Africa".into(), country_code: "ZA".into(), city: "Johannesburg".into(), flag: "🇿🇦".into(), ping: 112, load: 17, premium: true, servers: 180 },
        VpnServer { id: "kr-seo".into(), country: "South Korea".into(), country_code: "KR".into(), city: "Seoul".into(), flag: "🇰🇷".into(), ping: 73, load: 25, premium: false, servers: 440 },
        VpnServer { id: "es-mad".into(), country: "Spain".into(), country_code: "ES".into(), city: "Madrid".into(), flag: "🇪🇸".into(), ping: 49, load: 21, premium: false, servers: 360 },
    ]
});

pub fn find_server(id: &str) -> Option<VpnServer> {
    VPN_SERVERS.iter().find(|s| s.id == id).cloned()
}
