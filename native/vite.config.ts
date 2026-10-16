import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri 2.0 + Vite + React + TypeScript config.
// - Port 1420 is the conventional Tauri dev port.
// - clearScreen:false keeps Rust compile output visible.
// - HMR overlay off so Rust panics don't get hidden.
// - The `tauri` field is read by `cargo tauri dev`.
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Vite options tailored for Tauri development
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0", // required so the Android emulator / device can reach the dev server
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 1421,
      // Prevent the HMR overlay from blocking Rust panic messages.
      overlay: false,
    },
    watch: {
      // Tell Vite to ignore watching the Rust source (it would cause infinite loops).
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    // Tauri uses Chromium on Windows / WebKit on macOS/iOS / system WebView on Android.
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
  },
}));
