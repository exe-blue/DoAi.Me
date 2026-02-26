import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PresetRow, Json } from "@/lib/supabase/types";
import { presetCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("presets")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<PresetRow[]>();

    if (error) throw error;

    return NextResponse.json({ presets: data ?? [] });
  } catch (error) {
    console.error("Error fetching presets:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch presets" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = presetCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { name, type, description, config } = result.data;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("presets")
      .insert({ name, type, description: description ?? null, config: config as Json } as any)
      .select("*")
      .single()
      .returns<PresetRow>();

    if (error) throw error;

    return NextResponse.json({ preset: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating preset:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create preset" },
      { status: 500 }
    );
  }
}
