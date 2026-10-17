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

/**
 * Minimal shape of the NextAuth session we read from in `syncFromSession`.
 * Kept loose (no next-auth import here) so this store stays framework-agnostic.
 */
export interface NextAuthSessionLike {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

interface AuthState {
  user: UserProfile | null;
  /** Simulated OAuth flow — kept for the email-login fallback / offline demo. */
  loginWithYouTube: () => Promise<UserProfile>;
  loginWithEmail: (email: string, name?: string) => Promise<UserProfile>;
  /**
   * Populate the store from a real NextAuth session (Google profile). Called
   * by app-shell after `useSession()` resolves so any component that still
   * reads `useAuthStore` directly sees the real user.
   */
  syncFromSession: (session: NextAuthSessionLike | null) => void;
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
      syncFromSession: (session) => {
        if (!session?.user) return;
        const name = session.user.name || "YouTube User";
        const email = session.user.email || "";
        const profile: UserProfile = {
          id: email || "yt-session",
          name,
          email,
          avatar: session.user.image || makeAvatar(name),
          provider: "youtube",
          loggedInAt: new Date().toISOString(),
        };
        set({ user: profile });
      },
      logout: () => set({ user: null }),
    }),
    {
      name: "puretuber-auth",
      partialize: (s) => ({ user: s.user }) as any,
    }
  )
);
