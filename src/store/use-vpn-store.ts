"use client";

import { create } from "zustand";
import type { VpnStatus, VpnServer, VpnSettings } from "@/lib/types";
import { VPN_SERVERS, generateExitIp } from "@/lib/vpn-servers";

interface VpnState {
  status: VpnStatus;
  server: VpnServer;
  previousServerId: string | null;
  exitIp: string;
  // live stats
  downloadSpeed: number; // bytes/s
  uploadSpeed: number; // bytes/s
  dataDownloaded: number; // bytes
  dataUploaded: number; // bytes
  sessionStart: number | null; // ms timestamp
  // settings
  settings: VpnSettings;
  // actions
  connect: () => void;
  disconnect: () => void;
  selectServer: (s: VpnServer) => void;
  quickConnect: () => void;
  updateSettings: (partial: Partial<VpnSettings>) => void;
  tick: () => void; // called by interval to update stats
}

const DEFAULT_SERVER = VPN_SERVERS[0];

const DEFAULT_SETTINGS: VpnSettings = {
  autoConnect: false,
  killSwitch: true,
  splitTunneling: false,
  protocol: "WireGuard",
  adBlock: true,
  trackerBlock: true,
};

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
  settings: DEFAULT_SETTINGS,

  connect: () => {
    if (get().status === "connected" || get().status === "connecting") return;
    set({ status: "connecting" });
    // simulate handshake
    window.setTimeout(() => {
      set({
        status: "connected",
        exitIp: generateExitIp(get().server.countryCode),
        sessionStart: Date.now(),
        downloadSpeed: 0,
        uploadSpeed: 0,
      });
    }, 1600);
  },
  disconnect: () => {
    set({
      status: "disconnected",
      exitIp: "",
      downloadSpeed: 0,
      uploadSpeed: 0,
      sessionStart: null,
    });
  },
  selectServer: (s) => {
    const wasConnected = get().status === "connected";
    set({ server: s });
    if (wasConnected) {
      // reconnect through new server
      set({ status: "connecting" });
      window.setTimeout(() => {
        set({
          status: "connected",
          exitIp: generateExitIp(s.countryCode),
        });
      }, 1200);
    }
  },
  quickConnect: () => {
    // pick the lowest-ping server with load < 50
    const best = [...VPN_SERVERS]
      .filter((s) => !s.premium)
      .sort((a, b) => a.ping + a.load - (b.ping + b.load))[0];
    get().selectServer(best);
    if (get().status !== "connected") get().connect();
  },
  updateSettings: (partial) =>
    set({ settings: { ...get().settings, ...partial } }),
  tick: () => {
    const st = get();
    if (st.status !== "connected") return;
    const down = Math.floor(1_500_000 + Math.random() * 6_500_000); // 1.5–8 MB/s
    const up = Math.floor(120_000 + Math.random() * 480_000); // 0.12–0.6 MB/s
    set({
      downloadSpeed: down,
      uploadSpeed: up,
      dataDownloaded: st.dataDownloaded + down,
      dataUploaded: st.dataUploaded + up,
    });
  },
}));
