import type { NextAuthOptions } from "next-auth";
import { getServerSession as baseGetServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * NextAuth v4 configuration for PureTuber VPN.
 *
 * - Google provider with the YouTube readonly scope so we can read the user's
 *   liked videos, playlists, subscriptions and channel info.
 * - JWT session strategy (no DB needed) — the OAuth access token is stored in
 *   the JWT and surfaced on the session object so server-side route handlers
 *   can call the YouTube Data API on the user's behalf.
 *
 * Required env vars (see NEXTAUTH_SETUP.md):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXTAUTH_URL
 *   NEXTAUTH_SECRET
 *
 * If the Google env vars are not set, NextAuth will still boot but the Google
 * provider will be misconfigured — the simulated email login in
 * `useAuth()` continues to work as a fallback.
 */

// --- Type augmentation so the access token rides along on the session. -----
declare module "next-auth" {
  interface Session {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError" | "TokenExpiredError";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: "RefreshAccessTokenError" | "TokenExpiredError";
  }
}

const YOUTUBE_READONLY_SCOPE =
  "openid email profile https://www.googleapis.com/auth/youtube.readonly";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Refresh an expired Google access token using the stored refresh token.
 * Returns the new token fields or marks the JWT with an error.
 */
async function refreshAccessToken(token: import("next-auth/jwt").JWT) {
  if (!token.refreshToken) {
    token.error = "TokenExpiredError";
    return token;
  }
  try {
    const body = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    });
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
    const refreshed = (await res.json()) as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      scope?: string;
    };
    token.accessToken = refreshed.access_token;
    token.expiresAt = Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 3600);
    // Google only returns a new refresh_token on the first consent; preserve
    // the original otherwise.
    if (refreshed.refresh_token) token.refreshToken = refreshed.refresh_token;
    return token;
  } catch {
    token.error = "RefreshAccessTokenError";
    return token;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: YOUTUBE_READONLY_SCOPE,
          // Request a refresh token and force consent so the user explicitly
          // grants the YouTube readonly scope (Google only issues refresh
          // tokens when prompt=consent is set on first sign-in).
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in — persist the OAuth tokens on the JWT.
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        return token;
      }
      // Token still valid — pass through.
      if (token.expiresAt && token.expiresAt * 1000 > Date.now() + 60_000) {
        return token;
      }
      // Expired — try to refresh.
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.refreshToken = token.refreshToken;
      session.expiresAt = token.expiresAt;
      session.error = token.error;
      return session;
    },
  },
  // Don't crash if env vars are missing — the simulated auth flow still works.
  debug: false,
};

/**
 * Server-side helper for App Router route handlers and server components.
 * Reads cookies via `next/headers` (supported by next-auth v4.22+).
 */
export async function getServerSession() {
  return baseGetServerSession(authOptions);
}
