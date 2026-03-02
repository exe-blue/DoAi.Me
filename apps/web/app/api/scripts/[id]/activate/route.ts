import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/scripts/[id]/activate?version=N
 * Set status='active' for (id, version). Policy: only one active per id — other versions of same id set to 'archived'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get("version");
    const version = versionParam ? parseInt(versionParam, 10) : NaN;

    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "version query must be a positive integer" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    const { data: row, error: fetchErr } = await (supabase as any)
      .from("scripts")
      .select("id, version, status")
      .eq("id", id)
      .eq("version", version)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!row) {
      return NextResponse.json(
        { error: "Script version not found" },
        { status: 404 }
      );
    }

    await (supabase as any)
      .from("scripts")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "active");

    const { data: updated, error: updateErr } = await (supabase as any)
      .from("scripts")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("version", version)
      .select("id, name, version, status, updated_at")
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST /api/scripts/[id]/activate]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to activate script",
      },
      { status: 500 }
    );
  }
}
