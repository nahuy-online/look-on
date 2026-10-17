"use client";

import * as React from "react";
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * Client-side wrapper around next-auth/react's SessionProvider.
 *
 * Mounted once near the root of the app (inside ThemeProvider in app/layout.tsx)
 * so `useSession()` works from any client component.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
