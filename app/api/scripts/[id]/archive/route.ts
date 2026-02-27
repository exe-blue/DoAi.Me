import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/scripts/[id]/archive?version=N
 * Set status='archived' for (id, version).
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

    const { data: updated, error } = await supabase
      .from("scripts")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("version", version)
      .select("id, name, version, status, updated_at")
      .single();

    if (error) throw error;
    if (!updated) {
      return NextResponse.json(
        { error: "Script version not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[POST /api/scripts/[id]/archive]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to archive script",
      },
      { status: 500 }
    );
  }
}
