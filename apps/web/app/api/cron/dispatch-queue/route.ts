import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyCronAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dispatch-queue`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
