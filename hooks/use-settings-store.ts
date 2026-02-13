"use client";

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";

interface SettingEntry {
  value: unknown;
  description: string | null;
  updated_at: string | null;
}

interface SettingsState {
  settings: Record<string, SettingEntry>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  save: (updates: Record<string, unknown>) => Promise<void>;
  getValue: <T = unknown>(key: string, fallback: T) => T;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loading: false,
  saving: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("설정을 불러오는데 실패했습니다");
      const { settings } = await res.json();
      set({ settings, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "알 수 없는 오류",
        loading: false,
      });
    }
  },

  save: async (updates) => {
    set({ saving: true });
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "설정 저장에 실패했습니다");
      }
      const { settings: updated } = await res.json();
      // Merge updated values into current settings
      set((state) => ({
        settings: {
          ...state.settings,
          ...Object.fromEntries(
            Object.entries(updated).map(([key, val]) => [
              key,
              { ...state.settings[key], ...(val as SettingEntry) },
            ])
          ),
        },
        saving: false,
      }));
      toast({ title: "설정 저장 완료", description: "설정이 저장되었습니다." });
    } catch (err) {
      set({ saving: false });
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "설정 저장에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },

  getValue: <T = unknown>(key: string, fallback: T): T => {
    const entry = get().settings[key];
    return entry?.value !== undefined ? (entry.value as T) : fallback;
  },
}));
