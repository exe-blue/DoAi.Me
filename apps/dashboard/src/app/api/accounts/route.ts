import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, AccountRow, AccountStatus } from "@doai/supabase";

export const dynamic = "force-dynamic";

const accountPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["available", "in_use", "cooldown", "banned", "retired"]),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const supabase = createServerClient();
    let query = supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status as AccountStatus);
    }

    const { data, error } = await query.returns<AccountRow[]>();

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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = accountPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const updates: Record<string, unknown> = {
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.notes !== undefined) {
      updates.notes = parsed.data.notes;
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updates)
      .eq("id", parsed.data.id)
      .select()
      .single()
      .returns<AccountRow>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
