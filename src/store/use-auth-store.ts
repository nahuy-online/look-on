"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string; // initial or URL
  provider: "youtube" | "email";
  loggedInAt: string;
}

interface AuthState {
  user: UserProfile | null;
  loginWithYouTube: () => Promise<UserProfile>;
  loginWithEmail: (email: string, name?: string) => Promise<UserProfile>;
  logout: () => void;
}

// Simulated auth (real implementation needs YouTube Data API OAuth or InnerTube cookies).
// We generate a deterministic profile so the UI is fully functional.
function makeAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      loginWithYouTube: async () => {
        // simulate OAuth handshake delay
        await new Promise((r) => setTimeout(r, 1400));
        const name = "YouTube User";
        const profile: UserProfile = {
          id: "yt-" + Math.random().toString(36).slice(2, 10),
          name,
          email: "user@gmail.com",
          avatar: makeAvatar(name),
          provider: "youtube",
          loggedInAt: new Date().toISOString(),
        };
        set({ user: profile });
        return profile;
      },
      loginWithEmail: async (email, name) => {
        await new Promise((r) => setTimeout(r, 900));
        const display = name || email.split("@")[0];
        const profile: UserProfile = {
          id: "em-" + Math.random().toString(36).slice(2, 10),
          name: display,
          email,
          avatar: makeAvatar(display),
          provider: "email",
          loggedInAt: new Date().toISOString(),
        };
        set({ user: profile });
        return profile;
      },
      logout: () => set({ user: null }),
    }),
    {
      name: "puretuber-auth",
      partialize: (s) => ({ user: s.user }) as any,
    }
  )
);
