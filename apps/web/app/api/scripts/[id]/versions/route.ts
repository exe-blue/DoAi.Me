import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/scripts/[id]/versions
 * Copy latest version to version+1, status='draft'.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data: latest, error: fetchErr } = await (supabase as any)
      .from("scripts")
      .select("id, name, version, type, content, timeout_ms, params_schema, default_params")
      .eq("id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!latest) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    const newVersion = (latest.version as number) + 1;

    const { data: created, error: insertErr } = await (supabase as any)
      .from("scripts")
      .insert({
        id: latest.id,
        name: latest.name,
        version: newVersion,
        status: "draft",
        type: latest.type,
        content: latest.content,
        timeout_ms: latest.timeout_ms,
        params_schema: latest.params_schema ?? {},
        default_params: latest.default_params ?? {},
      })
      .select("id, name, version, status, type, timeout_ms, created_at")
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error("[POST /api/scripts/[id]/versions]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create script version",
      },
      { status: 500 }
    );
  }
}
