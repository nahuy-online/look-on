import { NextResponse } from "next/server";
import { VPN_SERVERS } from "@/lib/vpn-servers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ servers: VPN_SERVERS });
}
