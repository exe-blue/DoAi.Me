import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, type PresetRow, type Json } from "@doai/supabase";

export const dynamic = "force-dynamic";

const presetCreateSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["action", "script", "adb", "composite"]),
  description: z.string().max(500).optional(),
  config: z.record(z.unknown()).default({}),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  requires_account: z.boolean().default(false),
  requires_proxy: z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    const supabase = createServerClient();
    let query = supabase
      .from("presets")
      .select("*")
      .order("sort_order")
      .order("name");

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query.returns<PresetRow[]>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = presetCreateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("presets")
      .insert({ ...parsed.data, config: parsed.data.config as Json })
      .select()
      .single()
      .returns<PresetRow>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
