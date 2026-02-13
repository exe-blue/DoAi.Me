import { NextRequest, NextResponse } from "next/server";
import { getTasksWithDetails, createTask, updateTask, deleteTask } from "@/lib/db/tasks";
import { createManualTask } from "@/lib/pipeline";
import { mapTaskRow } from "@/lib/mappers";
import type { Json } from "@/lib/supabase/types";
import { taskCreateSchema, taskUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await getTasksWithDetails();
    const tasks = rows.map((row) => mapTaskRow(row as any));
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = taskCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { videoId, channelId, workerId, deviceCount, variables } = result.data;

    // Merge with defaults for variables
    const fullVariables = variables ? {
      watchPercent: variables.watchPercent ?? 80,
      commentProb: variables.commentProb ?? 10,
      likeProb: variables.likeProb ?? 40,
      saveProb: variables.saveProb ?? 5,
      subscribeToggle: variables.subscribeToggle ?? false,
    } : undefined;

    const task = await createManualTask(videoId, channelId, {
      deviceCount: deviceCount ?? 20,
      variables: fullVariables,
      workerId,
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create task" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = taskUpdateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { id, ...fields } = result.data;

    const updated = await updateTask(id, fields as any);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update task" },
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

    await deleteTask(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting task:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete task" },
      { status: 500 }
    );
  }
}
