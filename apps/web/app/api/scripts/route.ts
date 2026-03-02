import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateScriptName } from "@/lib/validate-script-name";

export const dynamic = "force-dynamic";

type ScriptRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  type: string;
  content: string;
  timeout_ms: number;
  params_schema: unknown;
  default_params: unknown;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * GET /api/scripts
 * Query: latestOnly=true (default) → id별 최신 version만; latestOnly=false → 전체 버전 목록
 * Query: status, type (filter), name (search substring)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const latestOnly = searchParams.get("latestOnly") !== "false";
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const name = searchParams.get("name");

    let query = (supabase as any)
      .from("scripts")
      .select(
        "id, name, version, status, type, content, timeout_ms, params_schema, default_params, created_at, updated_at",
      )
      .order("name")
      .order("version", { ascending: false });

    if (status) query = query.eq("status", status);
    if (type) query = query.eq("type", type);
    if (name && name.trim()) query = query.ilike("name", `%${name.trim()}%`);

    const { data: rawRows, error } = await query;
    const rows = rawRows as ScriptRow[] | null;

    if (error) throw error;

    let list = rows ?? [];

    if (latestOnly && list.length > 0) {
      const byId = new Map<string, ScriptRow>();
      for (const row of list) {
        if (!byId.has(row.id) || byId.get(row.id)!.version < row.version) {
          byId.set(row.id, row);
        }
      }
      list = Array.from(byId.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    }

    return NextResponse.json({ scripts: list });
  } catch (err) {
    console.error("[GET /api/scripts]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch scripts" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/scripts
 * Body: { name, type, content, timeout_ms?, params_schema?, default_params? }
 * Creates version=1, status='draft'. id is server-generated.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();

    const name = body?.name;
    const type = body?.type ?? "javascript";
    const content = body?.content ?? "";
    const timeout_ms = Math.max(0, Number(body?.timeout_ms) || 180000);
    const params_schema = body?.params_schema ?? {};
    const default_params = body?.default_params ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "name is required and must be non-empty" },
        { status: 400 },
      );
    }
    const nameValidation = validateScriptName(name);
    if (!nameValidation.ok) {
      return NextResponse.json(
        { error: (nameValidation as { ok: false; error: string }).error },
        { status: 400 },
      );
    }
    if (type !== "javascript" && type !== "adb_shell") {
      return NextResponse.json(
        { error: "type must be javascript or adb_shell" },
        { status: 400 },
      );
    }

    const { data, error } = await (supabase as any)
      .from("scripts")
      .insert({
        name: name.trim(),
        version: 1,
        status: "draft",
        type,
        content: typeof content === "string" ? content : String(content),
        timeout_ms,
        params_schema:
          typeof params_schema === "object" && params_schema !== null
            ? params_schema
            : {},
        default_params:
          typeof default_params === "object" && default_params !== null
            ? default_params
            : {},
      })
      .select("id, name, version, status, type, timeout_ms, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/scripts]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create script" },
      { status: 500 },
    );
  }
}
