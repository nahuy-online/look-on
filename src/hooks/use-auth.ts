"use client";

import * as React from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import {
  useAuthStore,
  type UserProfile,
  type NextAuthSessionLike,
} from "@/store/use-auth-store";

/**
 * Unified auth hook for PureTuber VPN.
 *
 * Bridges NextAuth (real Google OAuth) with the Zustand simulated auth store
 * so all UI components can keep using the same `{ user, loginWithYouTube,
 * loginWithEmail, logout, isAuthenticated }` shape regardless of whether the
 * user signed in via real Google OAuth or the simulated email form.
 *
 * Behaviour:
 *   - If a NextAuth session exists (status === "authenticated"), the `user`
 *     object is built from the real Google profile (`session.user`).
 *   - Otherwise we fall back to the Zustand-simulated user (set by the
 *     email-login flow or a previous simulated YouTube login).
 *   - `loginWithYouTube()` triggers a real OAuth redirect via `signIn("google")`.
 *     If Google env vars aren't configured, NextAuth will surface the error
 *     on its own error page — the simulated flow is no longer triggered.
 *   - `loginWithEmail()` stays simulated (no backend).
 *   - `logout()` signs out of NextAuth (if authenticated) AND clears the
 *     Zustand store.
 *
 * Also keeps the Zustand store in sync via `syncFromSession()` so any
 * component that still reads `useAuthStore` directly sees the real user.
 */
export interface UseAuthResult {
  user: UserProfile | null;
  isAuthenticated: boolean;
  /** True while NextAuth is hydrating the session on first mount. */
  isLoading: boolean;
  loginWithYouTube: (callbackUrl?: string) => Promise<void>;
  loginWithEmail: (email: string, name?: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
}

function makeInitialsAvatar(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
    name
  )}&backgroundColor=10b981,059669,14b8a6,0d9488&textColor=ffffff`;
}

function sessionToProfile(session: {
  user?: { name?: string | null; email?: string | null; image?: string | null };
}): UserProfile | null {
  if (!session?.user) return null;
  const name = session.user.name || "YouTube User";
  const email = session.user.email || "";
  return {
    id: email || "yt-session",
    name,
    email,
    avatar: session.user.image || makeInitialsAvatar(name),
    provider: "youtube",
    loggedInAt: new Date().toISOString(),
  };
}

export function useAuth(): UseAuthResult {
  const { data: session, status } = useSession();
  const storeUser = useAuthStore((s) => s.user);
  const storeLoginWithEmail = useAuthStore((s) => s.loginWithEmail);
  const storeLogout = useAuthStore((s) => s.logout);
  const syncFromSession = useAuthStore((s) => s.syncFromSession);

  const isLoading = status === "loading";
  const isAuthenticated =
    (status === "authenticated" && !!session?.user) || !!storeUser;

  // Keep the Zustand store in sync with the NextAuth session. This is a no-op
  // when there's no session (preserves the simulated user if one is set).
  React.useEffect(() => {
    syncFromSession((session as NextAuthSessionLike | null) ?? null);
  }, [session, syncFromSession]);

  // Prefer the real NextAuth user; fall back to the simulated store user.
  const user = React.useMemo<UserProfile | null>(() => {
    if (status === "authenticated" && session) {
      const p = sessionToProfile(session as any);
      if (p) return p;
    }
    return storeUser;
  }, [session, status, storeUser]);

  const loginWithYouTube = React.useCallback(
    async (callbackUrl = "/") => {
      // Real Google OAuth — this redirects the browser to Google's consent
      // screen and never resolves here on success.
      await signIn("google", { callbackUrl });
    },
    []
  );

  const loginWithEmail = React.useCallback(
    async (email: string, name?: string) => {
      return storeLoginWithEmail(email, name);
    },
    [storeLoginWithEmail]
  );

  const logout = React.useCallback(async () => {
    // Sign out of NextAuth (revokes the session cookie + JWT) AND clear the
    // local Zustand store so the simulated fallback is also reset.
    if (status === "authenticated") {
      await signOut({ callbackUrl: "/", redirect: false });
    }
    storeLogout();
  }, [status, storeLogout]);

  return {
    user,
    isAuthenticated,
    isLoading,
    loginWithYouTube,
    loginWithEmail,
    logout,
  };
}
