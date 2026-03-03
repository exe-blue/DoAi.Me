import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") return true;
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-channels`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
