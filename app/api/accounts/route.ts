import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountRow } from "@/lib/supabase/types";
import { accountCreateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AccountRow[]>();

    if (error) throw error;

    return NextResponse.json({ accounts: data ?? [] });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch accounts",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate request body
    const result = accountCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues }, { status: 400 });
    }

    const { email, status, device_id } = result.data;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("accounts")
      .insert({
        email,
        status: status ?? "available",
        device_id: device_id ?? null,
      })
      .select("*")
      .single()
      .returns<AccountRow>();

    if (error) throw error;

    return NextResponse.json({ account: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create account",
      },
      { status: 500 },
    );
  }
}
