"use client";

import { useEffect, useRef, useCallback } from "react";
import { subscribeTasks } from "@/lib/realtime";
import type { TaskRecord } from "@/lib/realtime";
import { mapTaskRow } from "@/lib/mappers";
import type { Task } from "@/lib/types";

/**
 * Subscribe to room:tasks and merge insert/update events into the tasks list
 * by calling onInsert/onUpdate with a Task (mapped from broadcast record).
 */
export interface UseRealtimeTasksOptions {
  /** Merge a new task into the list (insert). */
  onInsert: (task: Task) => void;
  /** Merge an updated task into the list (update by id). */
  onUpdate: (task: Task) => void;
}

/**
 * Maps a broadcast task record (raw DB row) to Task. Uses mapTaskRow with
 * minimal joined data (videos/channels null) for realtime payloads.
 */
function recordToTask(record: TaskRecord): Task {
  const row = {
    ...record,
    videos: null,
    channels: null,
  } as Parameters<typeof mapTaskRow>[0];
  return mapTaskRow(row, []);
}

/**
 * Subscribe to room:tasks. On insert/update, maps record to Task and calls the provided callbacks.
 */
export function useRealtimeTasks(options: UseRealtimeTasksOptions) {
  const { onInsert, onUpdate } = options;
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  onInsertRef.current = onInsert;
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const sub = subscribeTasks({
      onInsert: (record) => {
        try {
          const task = recordToTask(record);
          onInsertRef.current(task);
        } catch (e) {
          console.warn("[useRealtimeTasks] Failed to map insert record:", e);
        }
      },
      onUpdate: (record) => {
        try {
          const task = recordToTask(record);
          onUpdateRef.current(task);
        } catch (e) {
          console.warn("[useRealtimeTasks] Failed to map update record:", e);
        }
      },
    });
    return () => {
      sub?.unsubscribe().catch(() => {});
    };
  }, []);
}
