import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { CommandLogRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const before = searchParams.get("before");

    let query = supabase
      .from("command_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query.returns<CommandLogRow[]>();
    if (error) throw error;

    return NextResponse.json({ commands: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch commands" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();
    const { command, target_type, target_serials } = body;

    if (!command || !command.trim()) {
      return NextResponse.json({ error: "command is required" }, { status: 400 });
    }

    // Client-side safety check (agent also validates)
    const BLOCKED = [/rm\s+-rf/i, /format\s+/i, /factory[_\s]?reset/i, /wipe\s+/i, /flash\s+/i, /dd\s+if=/i];
    if (BLOCKED.some(p => p.test(command))) {
      return NextResponse.json({ error: "Command blocked by safety filter" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("command_logs")
      .insert({
        command: command.trim(),
        target_type: target_type || 'all',
        target_serials: target_serials || null,
        status: 'pending',
        initiated_by: 'dashboard',
      })
      .select()
      .single()
      .returns<CommandLogRow>();

    if (error) throw error;
    return NextResponse.json({ command_id: data.id }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create command" }, { status: 500 });
  }
}
