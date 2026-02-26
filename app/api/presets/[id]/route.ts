import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PresetRow } from "@/lib/supabase/types";
import { presetUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("presets")
      .select("*")
      .eq("id", id)
      .single()
      .returns<PresetRow>();

    if (error) throw error;

    return NextResponse.json({ preset: data });
  } catch (error) {
    console.error("Error fetching preset:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch preset" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate request body
    const result = presetUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();
    const updates: Record<string, any> = {};
    for (const key of ["name", "type", "description", "config"] as const) {
      if (key in result.data) {
        updates[key] = result.data[key];
      }
    }

    const { data, error } = await supabase
      .from("presets")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
      .returns<PresetRow>();

    if (error) throw error;

    return NextResponse.json({ preset: data });
  } catch (error) {
    console.error("Error updating preset:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update preset" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { id } = await params;

    const { error } = await supabase
      .from("presets")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting preset:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete preset" },
      { status: 500 }
    );
  }
}
