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
 * GET /api/workflows/[id]?version=N
 * Single workflow. If version omitted, returns latest version.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
          { status: 400 }
        );
      }
      const { data, error } = await (supabase as any)
        .from("workflows")
        .select("*")
        .eq("id", id)
        .eq("version", version)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "Workflow version not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(data);
    }

    const { data, error } = await (supabase as any)
      .from("workflows")
      .select("*")
      .eq("id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/workflows/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to fetch workflow",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/workflows/[id]?version=N
 * Update workflow (steps and optionally name, kind). version required.
 * steps must pass validateWorkflowSteps() or 400.
 */
export async function PATCH(
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
        { error: "version query is required and must be a positive integer" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.steps !== undefined) {
      const validation = validateWorkflowSteps(body.steps);
      if (!validation.ok) {
        const ve = validation as { ok: false; error: string; path?: string };
        return NextResponse.json(
          { error: ve.error, path: ve.path },
          { status: 400 }
        );
      }
      updates.steps = body.steps;
    }
    if (body.name !== undefined) updates.name = body.name;
    if (body.kind !== undefined) updates.kind = body.kind;
    if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

    const supabase = createSupabaseServerClient();
    const { data, error } = await (supabase as any)
      .from("workflows")
      .update(updates)
      .eq("id", id)
      .eq("version", version)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/workflows/[id]]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update workflow",
      },
      { status: 500 }
    );
  }
}
