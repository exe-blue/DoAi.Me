"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface RealtimeManagerState {
  connectionStatus: ConnectionStatus;
  retryCount: number;
  retryDelay: number;
  channels: Map<string, RealtimeChannel>;
  setStatus: (status: ConnectionStatus) => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  addChannel: (name: string, channel: RealtimeChannel) => void;
  removeChannel: (name: string) => void;
  clearChannels: () => void;
}

export const useRealtimeManagerStore = create<RealtimeManagerState>((set) => ({
  connectionStatus: "disconnected",
  retryCount: 0,
  retryDelay: 1000,
  channels: new Map(),
  setStatus: (status) => set({ connectionStatus: status }),
  incrementRetry: () =>
    set((state) => ({
      retryCount: state.retryCount + 1,
      retryDelay: Math.min(1000 * Math.pow(2, state.retryCount + 1), 30000),
    })),
  resetRetry: () => set({ retryCount: 0, retryDelay: 1000 }),
  addChannel: (name, channel) =>
    set((state) => {
      const newChannels = new Map(state.channels);
      newChannels.set(name, channel);
      return { channels: newChannels };
    }),
  removeChannel: (name) =>
    set((state) => {
      const newChannels = new Map(state.channels);
      newChannels.delete(name);
      return { channels: newChannels };
    }),
  clearChannels: () => set({ channels: new Map() }),
}));

/**
 * Initialize realtime connection manager
 * Subscribes to room:dashboard and room:system global channels
 * Implements auto-reconnect with exponential backoff
 */
export function initRealtime() {
  const supabase = createClient();
  if (!supabase) {
    console.warn("[Realtime Manager] Supabase client not available");
    return () => {};
  }

  const store = useRealtimeManagerStore.getState();
  store.setStatus("connecting");

  // Use a lightweight status-check channel to track connection health
  // Actual data channels (room:dashboard, room:system) are managed by the overview page
  const statusChannel = supabase
    .channel("room:realtime-status")
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[Realtime Manager] Connected");
        store.setStatus("connected");
        store.resetRetry();
      } else if (status === "CHANNEL_ERROR") {
        console.error("[Realtime Manager] Channel error");
        store.setStatus("disconnected");
        store.incrementRetry();
        scheduleReconnect();
      } else if (status === "TIMED_OUT") {
        console.error("[Realtime Manager] Connection timed out");
        store.setStatus("disconnected");
        store.incrementRetry();
        scheduleReconnect();
      }
    });

  store.addChannel("status", statusChannel);

  // Auto-reconnect on disconnect
  function scheduleReconnect() {
    const { retryDelay } = useRealtimeManagerStore.getState();
    setTimeout(() => {
      console.log(`[Realtime Manager] Reconnecting in ${retryDelay}ms...`);
      cleanup();
      initRealtime();
    }, retryDelay);
  }

  // Cleanup function
  function cleanup() {
    if (!supabase) return;
    const { channels } = useRealtimeManagerStore.getState();
    channels.forEach((channel) => {
      supabase.removeChannel(channel);
    });
    store.clearChannels();
  }

  return cleanup;
}

/**
 * Hook to get realtime connection status
 */
export function useRealtimeStatus() {
  const { connectionStatus, retryCount, retryDelay } =
    useRealtimeManagerStore();
  return { status: connectionStatus, retryCount, retryDelay };
}

/**
 * Hook to initialize realtime on mount
 */
export function useRealtimeInit() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current = initRealtime();
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);
}
