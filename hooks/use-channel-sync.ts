"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Channel, Content } from "@/lib/types";

interface SyncState {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  isSyncing: boolean;
  newVideoCount: number;
  error: string | null;
}

interface SyncResult {
  channels: Channel[];
  contents: Content[];
  syncMeta: {
    syncedAt: string;
    newVideoCount: number;
    autoCreatedTasks: number;
    channelsSynced: number;
  };
}

const STORAGE_KEY = "doai-last-sync";
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function useChannelSync(intervalMinutes?: number) {
  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncAt: null,
    nextSyncAt: null,
    isSyncing: false,
    newVideoCount: 0,
    error: null,
  });
  const [intervalMs, setIntervalMs] = useState(
    (intervalMinutes ?? 30) * 60 * 1000
  );
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onSyncCompleteRef = useRef<((result: SyncResult) => void) | null>(null);

  // Load last sync time from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSyncState((prev) => ({
        ...prev,
        lastSyncAt: stored,
        nextSyncAt: new Date(new Date(stored).getTime() + intervalMs).toISOString(),
      }));
    }
  }, [intervalMs]);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));
    try {
      const res = await fetch("/api/youtube/sync");
      if (!res.ok) throw new Error("Sync failed");
      const data: SyncResult = await res.json();

      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, now);

      setSyncState({
        lastSyncAt: now,
        nextSyncAt: new Date(Date.now() + intervalMs).toISOString(),
        isSyncing: false,
        newVideoCount: data.syncMeta.newVideoCount,
        error: null,
      });

      onSyncCompleteRef.current?.(data);
      return data;
    } catch (err) {
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        error: err instanceof Error ? err.message : "Sync failed",
      }));
      return null;
    }
  }, [intervalMs]);

  // Set up polling interval
  useEffect(() => {
    // Check if we should sync immediately (last sync was too long ago)
    const lastSync = localStorage.getItem(STORAGE_KEY);
    if (lastSync) {
      const elapsed = Date.now() - new Date(lastSync).getTime();
      if (elapsed >= intervalMs) {
        syncNow();
      }
    }

    timerRef.current = setInterval(() => {
      syncNow();
    }, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [intervalMs, syncNow]);

  const setInterval_ = useCallback((minutes: number) => {
    setIntervalMs(minutes * 60 * 1000);
  }, []);

  const onSyncComplete = useCallback((callback: (result: SyncResult) => void) => {
    onSyncCompleteRef.current = callback;
  }, []);

  return {
    syncState,
    syncNow,
    setInterval: setInterval_,
    onSyncComplete,
    intervalMinutes: intervalMs / 60000,
  };
}
