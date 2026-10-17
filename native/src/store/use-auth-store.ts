import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  provider: "google" | "email";
  accessToken?: string;
  loggedInAt: string;
}

interface OAuthUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

interface OAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  user: OAuthUser;
}

interface AuthState {
  user: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<UserProfile | null>;
  signInWithEmail: (email: string, name?: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  loadSession: () => Promise<void>;
}

function makeAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      loading: false,

      signInWithGoogle: async () => {
        set({ loading: true });
        try {
          // Try the native AppAuth flow (Rust command)
          const session = await invoke<OAuthSession>("oauth_sign_in");
          const profile: UserProfile = {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            avatar: session.user.avatar || makeAvatar(session.user.name),
            provider: "google",
            accessToken: session.accessToken,
            loggedInAt: new Date().toISOString(),
          };
          set({ user: profile, loading: false });
          return profile;
        } catch (err) {
          // Fallback: simulated sign-in (for dev/testing without AppAuth plugin)
          console.warn("[auth] Native OAuth not available, using simulated:", err);
          await new Promise((r) => setTimeout(r, 1200));
          const name = "Google User";
          const profile: UserProfile = {
            id: "sim-" + Math.random().toString(36).slice(2, 10),
            name,
            email: "user@gmail.com",
            avatar: makeAvatar(name),
            provider: "google",
            loggedInAt: new Date().toISOString(),
          };
          set({ user: profile, loading: false });
          return profile;
        }
      },

      signInWithEmail: async (email, name) => {
        set({ loading: true });
        await new Promise((r) => setTimeout(r, 800));
        const display = name || email.split("@")[0];
        const profile: UserProfile = {
          id: "em-" + Math.random().toString(36).slice(2, 10),
          name: display,
          email,
          avatar: makeAvatar(display),
          provider: "email",
          loggedInAt: new Date().toISOString(),
        };
        set({ user: profile, loading: false });
        return profile;
      },

      logout: async () => {
        try {
          await invoke("oauth_sign_out").catch(() => {});
        } catch {}
        set({ user: null });
      },

      loadSession: async () => {
        try {
          const session = await invoke<OAuthSession | null>("oauth_get_session");
          if (session) {
            set({
              user: {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                avatar: session.user.avatar || makeAvatar(session.user.name),
                provider: "google",
                accessToken: session.accessToken,
                loggedInAt: new Date().toISOString(),
              },
            });
          }
        } catch {
          // No active session — fine
        }
      },
    }),
    {
      name: "look-on-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user }) as any,
    }
  )
);
