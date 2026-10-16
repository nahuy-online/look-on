# PureTuber VPN — Tauri 2.0 Native App

A Pure Tuber / Green Tuber clone reimagined as a Tauri 2.0 native app for
**Android** (primary), **iOS** (future), and **Windows Desktop** (future).

The web app at `/home/z/my-project/` (Next.js) is the reference UI. This
native sibling uses the same React component patterns, the same emerald dark
theme, the same Zustand stores, and the same Invidious data model — but the
backend is **Rust** (Tauri commands), and the player is a native `<video>`
element so you get true ad-free playback up to 3× speed.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PureTuber VPN (Tauri 2.0)                    │
│                                                                        │
│  ┌───────────────┐   invoke()    ┌─────────────────────────────────┐  │
│  │  React (Vite) │ ────────────► │  Rust backend (src-tauri/src/)  │  │
│  │  port 1420    │ ◄──────────── │                                 │  │
│  │  - Home grid  │   JSON        │  trending/search/related        │  │
│  │  - Watch view │               │     └─► reqwest ─► Invidious    │  │
│  │  - VPN orb    │               │  video_streams                  │  │
│  │  - Downloads  │               │     └─► adaptiveFormats URL     │  │
│  │  - Settings   │               │  db_* (rusqlite, bundled)       │  │
│  └───────┬───────┘               │  vpn_connect/disconnect/status  │  │
│          │                       │     └─► VpnHandle trait          │  │
│          │ <video src=…>            │           ├─ SimulatedHandle    │  │
│          │   (Invidious stream URL)  │           └─ BoringTunHandle   │  │
│          ▼                       │                                 │  │
│  ┌───────────────┐               │  On Android:                     │  │
│  │  <video> tag  │               │   .plugin(puretuber_wireguard)   │  │
│  │  playbackRate │               │           └─► Kotlin VpnService  │  │
│  │  up to 3×     │               │                + GoBackend (WG)  │  │
│  └───────────────┘               └─────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

## Architecture at a glance

| Concern              | Web app (Next.js)              | Native app (Tauri 2.0)                            |
|----------------------|--------------------------------|---------------------------------------------------|
| UI                   | React 19 + shadcn              | React 19 + Tailwind (no shadcn, lighter)         |
| Routing              | Zustand view-state             | Zustand view-state (same)                         |
| Video metadata       | `/api/videos` → z-ai web_search | `invoke("trending")` → Rust → reqwest → Invidious |
| Video playback       | YouTube IFrame API             | Native `<video>` element + Invidious stream URL   |
| Ad-free              | IFrame (limited)               | TRUE ad-free via direct stream URLs              |
| Speed control        | 0.25×–2× (IFrame)              | 0.5×–3× (native `<video>`)                       |
| Persistence          | Prisma + SQLite                | rusqlite (bundled) at app data dir                |
| VPN backend          | Simulated in TS                | Rust `VpnHandle` trait: Simulated OR WireGuard    |
| WireGuard on Android | N/A                            | Kotlin `VpnService` + GoBackend plugin           |

## Prerequisites

### All platforms

- **Rust** (stable, 1.77+): https://rustup.rs/
- **Tauri CLI v2**:
  ```bash
  cargo install tauri-cli --version "^2.0"
  ```
- **Bun** (or npm/pnpm) for the frontend:
  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```
- **A code editor** with Rust + TypeScript support (VS Code + rust-analyzer).

### Android (primary target)

- **Android Studio** (Hedgehog 2023.1.1 or newer) — installs the SDK + NDK + platform tools.
- **Android SDK** API 24+ (Android 7.0+).
- **NDK** side-by-side 27.0+ (install via Android Studio → SDK Manager → SDK Tools → NDK Side by side).
- **JDK 17** (Android Studio bundles one; ensure `JAVA_HOME` points at it).
- **Rust Android targets**:
  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

### iOS (future, macOS only)

- macOS 13+ on Apple Silicon (or Intel).
- **Xcode 15+** with iOS 16+ SDK.
- `cargo install tauri-cli --version "^2.0"` then:
  ```bash
  rustup target add aarch64-apple-ios x86_64-apple-ios
  cargo install tauri-cli --version "^2.0"  # if not already
  ```

### Windows Desktop (future)

- Windows 10/11 with **MSVC build tools** (Visual Studio 2022 Build Tools → "Desktop development with C++").
- **WebView2 Runtime** (preinstalled on Win11; Win10 users may need the Evergreen Bootstrapper).

## Setup

```bash
cd /home/z/my-project/native

# 1. Install frontend deps
bun install

# 1b. Generate the Tauri icon set from a source 1024x1024 PNG (optional — only
#     needed for `cargo tauri build`/`cargo tauri android build`).
#     The src-tauri/icons/ directory is gitignored; if you skip this, builds
#     will fail with "icon not found".
# cargo tauri icon ./icon-source.png    # run once before your first build

# 2. Initialise the Android project (generates src-tauri/gen/android/)
cargo tauri android init

# 3. (Optional) Initialise iOS project — macOS only
cargo tauri ios init

# 4. Copy / register the WireGuard plugin
#    (see src-tauri/android-plugins/wireguard/README.md)
#    Add to src-tauri/Cargo.toml:
#       puretuber-wireguard = { path = "android-plugins/wireguard" }
#    And in src-tauri/src/lib.rs:
#       .plugin(puretuber_wireguard::init())
```

## Build & run

### Android

```bash
# Plug in a device (USB debugging on) or start an emulator, then:
cargo tauri android dev

# Release build → APK / AAB
cargo tauri android build
#   APK at: src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
#   AAB at: src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
```

To install on a connected device:

```bash
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
```

### iOS

```bash
cargo tauri ios dev       # simulator
cargo tauri ios build     # device build (requires Apple Developer account for signing)
```

### Windows Desktop

```bash
cargo tauri dev           # debug
cargo tauri build         # release → MSI / NSIS installer at src-tauri/target/release/bundle/
```

## Project layout

```
native/
├── package.json            # React 19 + Vite 6 + TS + Tailwind + zustand + sonner + lucide-react
├── vite.config.ts          # port 1420, HMR overlay off, host 0.0.0.0 (for Android dev server)
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js      # emerald-first dark theme tokens
├── postcss.config.js
├── index.html
├── .gitignore
├── README.md               # ← you are here
├── src/
│   ├── main.tsx
│   ├── App.tsx             # SPA shell: Sidebar + Header + view switch
│   ├── index.css           # Tailwind + dark theme + animations
│   ├── lib/
│   │   ├── types.ts        # VideoItem, VpnServer, StreamInfo, … (mirrors web app)
│   │   ├── format.ts       # formatViews, formatDuration, formatSpeed, formatData, formatSession
│   │   ├── invidious.ts    # CLIENT: invoke("trending" / "search" / "related" / "video_streams")
│   │   ├── vpn-servers.ts  # 20-location VPN catalog
│   │   └── utils.ts        # cn()
│   ├── store/
│   │   ├── use-app-store.ts     # view/activeVideo/searchQuery/category
│   │   ├── use-vpn-store.ts     # connect/disconnect → invoke; polls vpn_status every 1.5s
│   │   ├── use-queue-store.ts   # client-only queue (no IPC)
│   │   └── use-library-store.ts # liked/downloads/playlists/history → invoke("db_*")
│   └── components/
│       ├── sidebar.tsx     # nav + categories + quick-connect CTA
│       ├── header.tsx      # search bar + VPN status pill
│       ├── home-view.tsx   # Invidious trending grid (+ search mode)
│       ├── watch-view.tsx  # native <video> player + 3× speed + actions + related
│       ├── vpn-view.tsx    # connect orb + live stats + server list + settings
│       ├── downloads-view.tsx  # downloads / history / liked / playlists (one component, 4 modes)
│       └── settings-view.tsx
└── src-tauri/
    ├── Cargo.toml          # tauri 2, reqwest, tokio, rusqlite (bundled), boringtun (opt)
    ├── build.rs
    ├── tauri.conf.json     # productName "PureTuber VPN", id "com.puretuber.vpn"
    ├── capabilities/default.json   # core + sql + http (with Invidious CSP allow-list)
    ├── src/
    │   ├── main.rs         # entry → lib::run()
    │   ├── lib.rs          # registers plugins + all #[tauri::command] fns
    │   ├── invidious.rs    # multi-instance Invidious client + 5-min cache (reqwest)
    │   ├── db.rs           # rusqlite schema mirroring prisma/schema.prisma
    │   ├── models.rs       # serde structs (camelCase → matches TS types)
    │   └── vpn/
    │       ├── mod.rs              # VpnHandle trait + SimulatedHandle + default_handle()
    │       └── wireguard.rs        # build_wg_config() + BoringTunHandle stub
    ├── android-plugins/
    │   └── wireguard/      # Tauri mobile plugin: Rust crate + Android lib
    │       ├── Cargo.toml
    │       ├── src/lib.rs             # start_vpn/stop_vpn/get_status Tauri commands
    │       ├── README.md              # full integration guide
    │       └── android/
    │           ├── build.gradle.kts
    │           └── src/main/
    │               ├── AndroidManifest.xml
    │               └── java/com/puretuber/wireguard/
    │                   ├── WireGuardPlugin.kt        # startVpn/stopVpn/getStatus
    │                   └── WireGuardVpnService.kt    # foreground VpnService + TUN FD
    └── gen/
        └── android/README.md   # documents `cargo tauri android init` output
```

## Core feature walkthrough (the 3 must-work views)

### 1. Home — Invidious trending grid

- `HomeView` calls `fetchTrending(category)` from `src/lib/invidious.ts`.
- That delegates to `invoke("trending", { category })`.
- Rust `invidious::trending()` tries 5 public Invidious instances in order,
  with a 6-second timeout each, and a 5-minute in-memory cache.
- If all instances fail, the grid is empty (the web app merges with curated
  fallbacks; here we surface an honest "no results" state).

### 2. Watch — native `<video>` player with 3× speed

- `WatchView` calls `invoke("video_streams", { youtubeId })`.
- Rust `invidious::video_streams()` fetches `/api/v1/videos/:id` and:
  - Picks the best muxed URL from `formatStreams` (highest `qualityLabel`
    number) and stores it as `bestStreamUrl`.
  - Returns all `adaptiveFormats` + `formatStreams` in `formats[]`.
  - Returns `hlsUrl` if the instance exposes one.
- The React side sets `<video src={bestStreamUrl} controls autoPlay />` and a
  speed bar with `[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]`. The bar writes
  `videoEl.playbackRate = speed` — **true 3× ad-free** because we bypass the
  YouTube IFrame entirely.
- If `bestStreamUrl` is null (Invidious didn't return a muxed stream —
  increasingly common as instances remove them to dodge YouTube ToS), the
  view falls back to a `youtube-nocookie.com` IFrame so you can still watch.
  The IFrame shows ads and won't honour the 3× speed; the UI surfaces an
  honest amber banner explaining why.

### 3. VPN — connect orb calling Rust

- `VpnView`'s orb button calls `useVpnStore.connect()`.
- The store calls `invoke("vpn_connect", { serverId })`, then starts a
  `setInterval` polling `invoke("vpn_status")` every 1.5 s.
- Rust `vpn_connect` looks up the server in `VPN_SERVERS`, then calls
  `state.vpn.connect(&server)`.
- `state.vpn` is a `Box<dyn VpnHandle>` chosen by `default_handle()`:
  - On Android, it's currently the `SimulatedHandle` (the `BoringTunHandle`
    / Android plugin bridge is scaffolded but not wired — see below).
  - On desktop, it's also `SimulatedHandle` unless the `desktop-wg` Cargo
    feature is enabled and `BoringTunHandle` is finished.
- `vpn_status()` advances the simulated byte counters using random speeds
  (1.5–8 MB/s down, 0.12–0.6 MB/s up) and returns the current `VpnStatusResponse`.
- The store surfaces a "Simulated mode" / "WireGuard tunnel active" badge
  based on the `real` flag.

## Honest notes

### WireGuard

This scaffold **generates** WireGuard configs (see
`src-tauri/src/vpn/wireguard.rs::build_wg_config`) and **plumbs** them through
to a Kotlin `VpnService` plugin (see
`src-tauri/android-plugins/wireguard/`), but it does **not** ship real server
credentials. Without a real WireGuard server (peer public key + endpoint) and
a real client private key, the tunnel cannot come up. By design, the app falls
back to a **simulated** VPN handle so the UI is demoable end-to-end. Switching
to real mode is a 3-step change documented in
`src-tauri/android-plugins/wireguard/README.md`.

Also note the Rust → Kotlin JNI bridge in `android-plugins/wireguard/src/lib.rs`
is a TODO stub. Finishing it requires attaching to the JVM via the `jni` crate
and calling `WireGuardPlugin.startVpn(context, config)`. Until then, even on
Android, the simulated handle is used.

### Invidious

Public Invidious instances are rate-limited, frequently down, and increasingly
remove muxed `formatStreams` (which are needed for the native `<video>` tag to
play without MSE). For a production app, **self-host your own Invidious
instance** and point `INV_INSTANCES` in `src-tauri/src/invidious.rs` at it.
That gives you:

- Reliable trending/search/related feeds.
- Reliable `bestStreamUrl` for ad-free `<video>` playback.
- No rate limits.
- A single CORS-free origin (since the request originates from Rust, CORS
  isn't a concern, but you also bypass IP-based rate limiting).

### shadcn/ui

The web app uses 50+ shadcn primitives. The native port intentionally uses
plain Tailwind utilities (a `cn()` helper, basic `<button>` and `<input>` etc.)
to keep the bundle small and the build dependency-free. The look is similar
(emerald dark theme) but the components are hand-rolled.

## Troubleshooting

- **`cargo tauri android init` fails with "NDK not found"**: ensure NDK
  side-by-side 27+ is installed via Android Studio's SDK Manager, and that
  `ANDROID_HOME` / `NDK_HOME` env vars are set.
- **`cargo tauri android dev` shows a blank screen on device**: the dev server
  runs on the host's `localhost:1420`. The Android device can't reach
  `localhost` — Tauri 2 auto-rewrites the URL to your host LAN IP, but ensure
  no firewall blocks port 1420. Alternatively, use an emulator (which can
  reach the host via `10.0.2.2`).
- **`<video>` shows "no video with supported format"**: Invidious returned an
  adaptive format URL but no muxed stream. The frontend automatically falls
  back to the YouTube IFrame. Self-hosting Invidious usually fixes this.
- **`reqwest` fails to build for Android**: ensure you installed all four
  Rust Android targets (`rustup target add aarch64-linux-android …`) and that
  you're using the `rustls-tls` feature (already configured — `reqwest`'s
  default `native-tls` feature is harder to cross-compile).
- **App crashes on launch with `failed to open SQLite DB`**: the app data dir
  couldn't be created. On Android 10+ this should "just work"; on older
  versions ensure the app has storage permissions.

## License

MIT — see the parent project's `worklog.md`.
