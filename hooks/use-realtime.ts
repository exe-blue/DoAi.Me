"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { TaskRow, TaskLogRow } from "@/lib/supabase/types";

// ============================================================
// Broadcast 기반 Realtime 훅
// DB 트리거 → pg_net → Realtime Broadcast API → 클라이언트
// ============================================================

type BroadcastEvent = "insert" | "update" | "delete";

interface BroadcastPayload<T> {
  type: BroadcastEvent;
  record: T;
  old_record?: T | null;
}

/**
 * room:tasks Broadcast 구독
 * tasks 테이블 변경 시 실시간 수신
 *
 * @example
 * ```tsx
 * useTasksBroadcast({
 *   onInsert: (task) => addTask(task),
 *   onUpdate: (task, old) => updateTask(task),
 *   onDelete: (task) => removeTask(task),
 * });
 * ```
 */
export function useTasksBroadcast(handlers: {
  onInsert?: (task: TaskRow) => void;
  onUpdate?: (task: TaskRow, oldTask: TaskRow | null) => void;
  onDelete?: (task: TaskRow) => void;
}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    channelRef.current = supabase
      .channel("room:tasks")
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const data = payload as BroadcastPayload<TaskRow>;
        if (data?.record) {
          handlersRef.current.onInsert?.(data.record);
        }
      })
      .on("broadcast", { event: "update" }, ({ payload }) => {
        const data = payload as BroadcastPayload<TaskRow>;
        if (data?.record) {
          handlersRef.current.onUpdate?.(
            data.record,
            data.old_record ?? null
          );
        }
      })
      .on("broadcast", { event: "delete" }, ({ payload }) => {
        const data = payload as BroadcastPayload<TaskRow>;
        if (data?.record) {
          handlersRef.current.onDelete?.(data.record);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] Subscribed to room:tasks");
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}

/**
 * room:task:<taskId>:logs Broadcast 구독
 * 특정 태스크의 실행 로그를 실시간 수신
 *
 * @example
 * ```tsx
 * useTaskLogsBroadcast(taskId, {
 *   onLog: (log) => appendLog(log),
 * });
 * ```
 */
export function useTaskLogsBroadcast(
  taskId: string | null,
  handlers: {
    onLog?: (log: TaskLogRow) => void;
  }
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!taskId) return;

    const supabase = createClient();
    if (!supabase) return;

    const channelName = `room:task:${taskId}:logs`;

    channelRef.current = supabase
      .channel(channelName)
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const data = payload as BroadcastPayload<TaskLogRow>;
        if (data?.record) {
          handlersRef.current.onLog?.(data.record);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] Subscribed to ${channelName}`);
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [taskId]);
}

/**
 * room:task_logs 전체 로그 Broadcast 구독 (대시보드 모니터링)
 *
 * @example
 * ```tsx
 * useAllTaskLogsBroadcast({
 *   onLog: (log) => appendToGlobalLog(log),
 * });
 * ```
 */
export function useAllTaskLogsBroadcast(handlers: {
  onLog?: (log: TaskLogRow) => void;
}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    channelRef.current = supabase
      .channel("room:task_logs")
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const data = payload as BroadcastPayload<TaskLogRow>;
        if (data?.record) {
          handlersRef.current.onLog?.(data.record);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] Subscribed to room:task_logs");
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}

/**
 * 범용 Broadcast 구독 훅
 * 임의의 채널/이벤트 조합에 사용
 *
 * @example
 * ```tsx
 * useBroadcast('room:workers', ['update'], (event, payload) => {
 *   console.log('Worker changed:', payload);
 * });
 * ```
 */
export function useBroadcast<T = unknown>(
  channelName: string | null,
  events: BroadcastEvent[],
  callback: (event: BroadcastEvent, payload: BroadcastPayload<T>) => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!channelName) return;

    const supabase = createClient();
    if (!supabase) return;

    let channel = supabase.channel(channelName);

    for (const event of events) {
      channel = channel.on("broadcast", { event }, ({ payload }) => {
        callbackRef.current(event, payload as BroadcastPayload<T>);
      });
    }

    channelRef.current = channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(`[Realtime] Subscribed to ${channelName}`);
      }
    });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, events.join(",")]);
}
