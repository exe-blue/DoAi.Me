import { NextRequest, NextResponse } from "next/server";
import { getTasksWithDetails, updateTask, deleteTask } from "@/lib/db/tasks";
import { createManualTask, createBatchTask } from "@/lib/pipeline";
import { mapTaskRow } from "@/lib/mappers";
import { taskCreateSchema, taskUpdateSchema, batchTaskCreateSchema } from "@/lib/schemas";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

function sortTasksByPriority<T extends { source?: string | null; priority?: number | null; createdAt?: string }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aManual = (a.source ?? "channel_auto") === "manual" ? 0 : 1;
    const bManual = (b.source ?? "channel_auto") === "manual" ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    const pa = a.priority ?? 5;
    const pb = b.priority ?? 5;
    if (pa !== pb) return pb - pa;
    const ta = a.createdAt ?? "";
    const tb = b.createdAt ?? "";
    return new Date(tb).getTime() - new Date(ta).getTime();
  });
}

export async function GET() {
  try {
    const rows = await getTasksWithDetails();
    const tasks = rows.map((row) => mapTaskRow(row as any));
    const sorted = sortTasksByPriority(tasks);
    return NextResponse.json({ tasks: sorted });
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

    let createdByUserId: string | undefined;
    if (!request.headers.has("x-api-key")) {
      try {
        const supabase = await createAuthServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) createdByUserId = user.id;
      } catch {
        // ignore
      }
    }

    // Check if this is a batch task (has contentMode field)
    if ("contentMode" in body) {
      // Validate as batch task
      const result = batchTaskCreateSchema.safeParse(body);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.issues },
          { status: 400 }
        );
      }

      const { contentMode, videoId, channelId, videoIds, distribution, workerId, deviceCount, variables, source, priority } = result.data;

      const fullVariables = variables ? {
        watchPercent: variables.watchPercent ?? 80,
        commentProb: variables.commentProb ?? 10,
        likeProb: variables.likeProb ?? 40,
        saveProb: variables.saveProb ?? 5,
        subscribeToggle: variables.subscribeToggle ?? false,
      } : undefined;

      const task = await createBatchTask({
        contentMode,
        videoId,
        channelId,
        videoIds,
        distribution,
        deviceCount: deviceCount ?? 20,
        variables: fullVariables,
        workerId,
        createdByUserId,
        source: source ?? (priority != null && priority >= 6 ? "manual" : undefined),
        priority: priority ?? (source === "manual" ? 8 : undefined),
      });

      return NextResponse.json(task, { status: 201 });
    }

    // Fall back to regular task creation (backward compatible)
    const result = taskCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { videoId, channelId, workerId, deviceCount, variables, source, priority } = result.data;

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
      createdByUserId,
      source: source ?? (priority != null && priority >= 6 ? "manual" : undefined),
      priority: priority ?? (source === "manual" ? 8 : undefined),
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
