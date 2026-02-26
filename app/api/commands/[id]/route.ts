import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { CommandLogRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("command_logs")
      .select("*")
      .eq("id", id)
      .single()
      .returns<CommandLogRow>();

    if (error) throw error;
    return NextResponse.json({ command: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Command not found" }, { status: 404 });
  }
}
