// VPN store for the Tauri native app.
//
// Unlike the web app (simulated), this store delegates connect/disconnect to
// Rust commands `vpn_connect` / `vpn_disconnect` and polls `vpn_status` for
// live stats. The Rust backend either talks to the real Android VpnService
// plugin (on Android) or returns a simulated status (other platforms — see
// src-tauri/src/vpn/mod.rs).

import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { VpnStatus, VpnServer, VpnSettings, VpnStatusResponse } from "@/lib/types";
import { VPN_SERVERS, DEFAULT_SERVER } from "@/lib/vpn-servers";

interface VpnState {
  status: VpnStatus;
  server: VpnServer;
  previousServerId: string | null;
  exitIp: string;
  downloadSpeed: number;
  uploadSpeed: number;
  dataDownloaded: number;
  dataUploaded: number;
  sessionStart: number | null;
  /** True when the Rust backend reports a real (Android VpnService) tunnel. */
  real: boolean;
  settings: VpnSettings;
  pollHandle: number | null;

  // actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectServer: (s: VpnServer) => void;
  quickConnect: () => Promise<void>;
  updateSettings: (partial: Partial<VpnSettings>) => void;
  refreshStatus: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

const DEFAULT_SETTINGS: VpnSettings = {
  autoConnect: false,
  killSwitch: true,
  splitTunneling: false,
  protocol: "WireGuard",
  adBlock: true,
  trackerBlock: true,
};

const POLL_INTERVAL_MS = 1500;

export const useVpnStore = create<VpnState>((set, get) => ({
  status: "disconnected",
  server: DEFAULT_SERVER,
  previousServerId: null,
  exitIp: "",
  downloadSpeed: 0,
  uploadSpeed: 0,
  dataDownloaded: 0,
  dataUploaded: 0,
  sessionStart: null,
  real: false,
  settings: DEFAULT_SETTINGS,
  pollHandle: null,

  connect: async () => {
    const st = get();
    if (st.status === "connected" || st.status === "connecting") return;
    set({ status: "connecting" });
    get().startPolling();
    try {
      const resp = await invoke<VpnStatusResponse>("vpn_connect", {
        serverId: st.server.id,
      });
      set({
        status: resp.status,
        exitIp: resp.exitIp,
        sessionStart: resp.sessionStart,
        downloadSpeed: resp.downloadSpeed,
        uploadSpeed: resp.uploadSpeed,
        dataDownloaded: resp.dataDownloaded,
        dataUploaded: resp.dataUploaded,
        real: resp.real,
      });
    } catch (err) {
      console.error("[vpn] connect failed:", err);
      set({ status: "disconnected" });
      get().stopPolling();
    }
  },

  disconnect: async () => {
    try {
      await invoke("vpn_disconnect");
    } catch (err) {
      console.error("[vpn] disconnect failed:", err);
    }
    set({
      status: "disconnected",
      exitIp: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      sessionStart: null,
    });
    get().stopPolling();
  },

  selectServer: (s) => {
    const wasConnected = get().status === "connected";
    set({ server: s, previousServerId: get().server.id });
    if (wasConnected) {
      // reconnect through the new server
      void get().disconnect().then(() => {
        setTimeout(() => void get().connect(), 200);
      });
    }
  },

  quickConnect: async () => {
    const best = [...VPN_SERVERS]
      .filter((s) => !s.premium)
      .sort((a, b) => a.ping + a.load - (b.ping + b.load))[0];
    get().selectServer(best);
    if (get().status !== "connected" && get().status !== "connecting") {
      await get().connect();
    }
  },

  updateSettings: (partial) =>
    set({ settings: { ...get().settings, ...partial } }),

  refreshStatus: async () => {
    try {
      const resp = await invoke<VpnStatusResponse>("vpn_status");
      set({
        status: resp.status,
        exitIp: resp.exitIp,
        downloadSpeed: resp.downloadSpeed,
        uploadSpeed: resp.uploadSpeed,
        dataDownloaded: resp.dataDownloaded,
        dataUploaded: resp.dataUploaded,
        sessionStart: resp.sessionStart,
        real: resp.real,
        server:
          resp.serverId && resp.serverId !== get().server.id
            ? VPN_SERVERS.find((s) => s.id === resp.serverId) ?? get().server
            : get().server,
      });
    } catch (err) {
      console.error("[vpn] status poll failed:", err);
    }
  },

  startPolling: () => {
    if (get().pollHandle !== null) return;
    const h = window.setInterval(() => {
      void get().refreshStatus();
    }, POLL_INTERVAL_MS);
    set({ pollHandle: h });
  },

  stopPolling: () => {
    const h = get().pollHandle;
    if (h !== null) {
      window.clearInterval(h);
      set({ pollHandle: null });
    }
  },
}));
