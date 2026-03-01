import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateWorkflowSteps } from "@/lib/workflow-schema";

export const dynamic = "force-dynamic";

type WorkflowRow = {
  id: string;
  version: number;
  kind: string;
  name: string;
  is_active: boolean;
  steps: unknown;
  created_at: string | null;
  updated_at: string | null;
};

/**
 * GET /api/workflows
 * List workflows: id별 최신 version만 (default).
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("workflows")
      .select("id, version, kind, name, is_active, steps, created_at, updated_at")
      .order("id")
      .order("version", { ascending: false })
      .returns<WorkflowRow[]>();

    if (error) throw error;

    const byId = new Map<string, WorkflowRow>();
    for (const row of rows ?? []) {
      if (!byId.has(row.id) || byId.get(row.id)!.version < row.version) {
        byId.set(row.id, row);
      }
    }
    const list = Array.from(byId.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    return NextResponse.json({ workflows: list });
  } catch (err) {
    console.error("[GET /api/workflows]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch workflows",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workflows
 * Body: { id, name, kind, steps }
 * Creates version=1. steps must pass validateWorkflowSteps() or 400.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();

    const id = body?.id;
    const name = body?.name ?? "";
    const kind = body?.kind ?? "MAIN";
    const steps = body?.steps;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "id is required and must be non-empty" },
        { status: 400 }
      );
    }

    const validation = validateWorkflowSteps(steps);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, path: validation.path },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("workflows")
      .insert({
        id: id.trim(),
        version: 1,
        kind: kind.trim() || "MAIN",
        name: typeof name === "string" ? name.trim() : String(name),
        is_active: true,
        steps: steps ?? [],
      })
      .select("id, version, kind, name, is_active, steps, created_at, updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/workflows]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create workflow",
      },
      { status: 500 }
    );
  }
}
