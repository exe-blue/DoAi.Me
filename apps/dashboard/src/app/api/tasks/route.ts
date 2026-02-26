import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, type TaskListView, type TaskRow, type TaskStatus, type Json } from "@doai/supabase";

export const dynamic = "force-dynamic";

const taskCreateSchema = z.object({
  type: z.enum(["preset", "adb", "direct", "batch", "youtube"]),
  preset_id: z.string().uuid().optional(),
  payload: z.record(z.unknown()).default({}),
  target_devices: z.array(z.string()).optional(),
  target_workers: z.array(z.string()).optional(),
  target_tag: z.string().optional(),
  title: z.string().optional(),
  priority: z.number().int().min(0).max(10).default(5),
  devices_total: z.number().int().min(1).max(1000).optional(),
  video_id: z.string().uuid().optional(),
  channel_id: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") ?? "1", 10);
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10),
      100
    );

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("v_task_list")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status as TaskStatus);
    }

    const { data, error, count } = await query
      .range(from, to)
      .returns<TaskListView[]>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const totalPages = count ? Math.ceil(count / limit) : 0;

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const validated = taskCreateSchema.parse(body);

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        type: validated.type,
        preset_id: validated.preset_id,
        payload: validated.payload as Json,
        target_devices: validated.target_devices,
        target_workers: validated.target_workers,
        target_tag: validated.target_tag,
        title: validated.title,
        priority: validated.priority,
        devices_total: validated.devices_total,
        video_id: validated.video_id,
        channel_id: validated.channel_id,
        status: "pending" as const,
        devices_done: 0,
        devices_failed: 0,
      })
      .select("*")
      .returns<TaskRow[]>()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
