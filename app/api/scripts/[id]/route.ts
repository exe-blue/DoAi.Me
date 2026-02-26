import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { validateScriptName } from "../../../../lib/validate-script-name";

export const dynamic = "force-dynamic";

/**
 * GET /api/scripts/[id]?version=N
 * Single script. If version omitted, returns latest version.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get("version");

    const supabase = createSupabaseServerClient();

    if (versionParam) {
      const version = parseInt(versionParam, 10);
      if (!Number.isInteger(version) || version < 1) {
        return NextResponse.json(
          { error: "version must be a positive integer" },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("scripts")
        .select("*")
        .eq("id", id)
        .eq("version", version)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "Script version not found" },
          { status: 404 },
        );
      }
      return NextResponse.json(data);
    }

    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/scripts/[id]]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to fetch script",
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/scripts/[id]?version=N
 * Update script (content, timeout_ms, params_schema, default_params, name). version required.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get("version");
    const version = versionParam ? parseInt(versionParam, 10) : NaN;

    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "version query is required and must be a positive integer" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const nameValidation = validateScriptName(body.name);
      if (!nameValidation.ok) {
        return NextResponse.json(
          { error: nameValidation.error },
          { status: 400 },
        );
      }
      updates.name =
        typeof body.name === "string" ? body.name.trim() : body.name;
    }
    if (body.content !== undefined) updates.content = body.content;
    if (body.timeout_ms !== undefined)
      updates.timeout_ms = Math.max(0, Number(body.timeout_ms) || 180000);
    if (body.params_schema !== undefined)
      updates.params_schema = body.params_schema;
    if (body.default_params !== undefined)
      updates.default_params = body.default_params;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length <= 1) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("scripts")
      .update(updates)
      .eq("id", id)
      .eq("version", version)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/scripts/[id]]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to update script",
      },
      { status: 500 },
    );
  }
}
