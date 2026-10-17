import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Single NextAuth handler that serves both GET and POST for the catch-all
// /api/auth/* routes (sign-in, callback, sign-out, session, csrf, providers).
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
