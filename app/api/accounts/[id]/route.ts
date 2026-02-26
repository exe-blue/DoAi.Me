import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { AccountRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", id)
      .single()
      .returns<AccountRow>();

    if (error) throw error;

    return NextResponse.json({ account: data });
  } catch (error) {
    console.error("Error fetching account:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch account" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;
    const body = await request.json();

    const allowedFields: (keyof AccountRow)[] = [
      "email",
      "status",
      "device_id",
      "login_count",
      "last_used",
      "banned_at",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
      .returns<AccountRow>();

    if (error) throw error;

    return NextResponse.json({ account: data });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update account" },
      { status: 500 }
    );
  }
}
