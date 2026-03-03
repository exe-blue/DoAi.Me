import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Verify cron authentication using a static shared secret.
 * The secret must match the CRON_SECRET environment variable.
 */
function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const providedSecret = authHeader.replace("Bearer ", "").trim();
  if (!providedSecret) return false;

  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error("[Cron Auth] CRON_SECRET environment variable not configured");
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  return providedSecret === expectedSecret;
}

/**
 * POST /api/cron/sync-channels
 * Called by Supabase pg_cron via HTTP POST with a static Bearer token.
 * The token must match the CRON_SECRET environment variable.
 */
export async function POST(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSyncChannels();
  if (!result.ok) {
    const err = "error" in result ? result.error : "Sync failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(result);
}
