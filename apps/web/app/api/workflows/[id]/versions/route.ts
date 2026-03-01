import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/workflows/[id]/versions
 * Copy latest version to version+1 (steps copied).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data: latest, error: fetchErr } = await supabase
      .from("workflows")
      .select("id, version, kind, name, is_active, steps")
      .eq("id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!latest) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }

    const newVersion = (latest.version as number) + 1;

    const { data: created, error: insertErr } = await supabase
      .from("workflows")
      .insert({
        id: latest.id,
        version: newVersion,
        kind: latest.kind,
        name: latest.name,
        is_active: latest.is_active,
        steps: latest.steps ?? [],
      })
      .select("id, version, kind, name, is_active, steps, created_at, updated_at")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/workflows/[id]/versions]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to create workflow version",
      },
      { status: 500 }
    );
  }
}
