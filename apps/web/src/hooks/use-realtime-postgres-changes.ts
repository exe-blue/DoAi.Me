"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserClient } from "@/lib/supabase/client";

type BackoffConfig = {
  initialMs?: number;
  maxMs?: number;
  multiplier?: number;
};

type UseRealtimePostgresChangesOptions = {
  channel: string;
  schema?: string;
  table: string;
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  enabled?: boolean;
  onChange: (payload: unknown) => void;
  backoff?: BackoffConfig;
};

export function useRealtimePostgresChanges({
  channel,
  schema = "public",
  table,
  event = "*",
  filter,
  enabled = true,
  onChange,
  backoff,
}: UseRealtimePostgresChangesOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mountedRef = useRef(true);

  const cfg = {
    initialMs: backoff?.initialMs ?? 1000,
    maxMs: backoff?.maxMs ?? 30000,
    multiplier: backoff?.multiplier ?? 2,
  };

  const clearReconnectTimer = () => {
    if (!reconnectTimerRef.current) return;
    clearTimeout(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  };

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer();
    const delay = Math.min(cfg.initialMs * cfg.multiplier ** attempt, cfg.maxMs);
    reconnectTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setAttempt((prev) => prev + 1);
    }, delay);
  }, [attempt, cfg.initialMs, cfg.maxMs, cfg.multiplier]);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return () => void 0;

    const supabase = createBrowserClient();
    if (!supabase) return () => void 0;

    const realtimeChannel = supabase
      .channel(channel)
      .on(
        "postgres_changes",
        {
          event,
          schema,
          table,
          ...(filter ? { filter } : {}),
        },
        (payload) => {
          onChange(payload);
        }
      )
      .subscribe((status) => {
        if (!mountedRef.current) return;
        if (status === "SUBSCRIBED") {
          setIsConnected(true);
          setAttempt(0);
          clearReconnectTimer();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setIsConnected(false);
          scheduleReconnect();
        }
      });

    channelRef.current = realtimeChannel;

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      setIsConnected(false);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [attempt, channel, enabled, event, filter, onChange, scheduleReconnect, schema, table]);

  return { isConnected, attempt };
}
