import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSchedulesForChannel,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/lib/db/schedules";
import { scheduleCreateSchema, scheduleUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json(
        { error: "channelId query parameter is required" },
        { status: 400 }
      );
    }

    const schedules = await getActiveSchedulesForChannel(channelId);
    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = scheduleCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { channelId, name, taskType, triggerType, triggerConfig, deviceCount } = result.data;

    const schedule = await createSchedule({
      channel_id: channelId,
      name,
      task_type: taskType,
      trigger_type: triggerType,
      trigger_config: triggerConfig as any,
      device_count: deviceCount,
    });

    return NextResponse.json(schedule, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create schedule" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = scheduleUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { id, ...fields } = result.data;

    const updated = await updateSchedule(id, fields);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating schedule:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update schedule" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteSchedule(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete schedule" },
      { status: 500 }
    );
  }
}
