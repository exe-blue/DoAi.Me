import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings
 * Returns all settings as { [key]: { value, description, updated_at } }
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("settings")
      .select("key, value, description, updated_at")
      .order("key");

    if (error) throw error;

    const settings: Record<string, { value: unknown; description: string | null; updated_at: string | null }> = {};
    for (const row of data ?? []) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        parsed = row.value;
      }
      settings[row.key] = {
        value: parsed,
        description: row.description,
        updated_at: row.updated_at,
      };
    }

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Body: { key1: value1, key2: value2, ... }
 * Partial update. Sets updated_at=now() per key.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();

    if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
      return NextResponse.json(
        { error: "Request body must be a non-empty object of key-value pairs" },
        { status: 400 }
      );
    }

    const updates: Array<{ key: string; value: string }> = [];
    for (const [key, value] of Object.entries(body)) {
      const serialized = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value);
      updates.push({ key, value: serialized });
    }

    // Update each setting individually (Supabase doesn't support bulk upsert with different values easily)
    const results: Record<string, { value: unknown; updated_at: string | null }> = {};
    for (const { key, value } of updates) {
      const { data, error } = await supabase
        .from("settings")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key)
        .select("key, value, updated_at")
        .single();

      if (error) {
        console.error(`Failed to update setting ${key}:`, error.message);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(data.value);
      } catch {
        parsed = data.value;
      }
      results[data.key] = { value: parsed, updated_at: data.updated_at };
    }

    return NextResponse.json({ settings: results });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
