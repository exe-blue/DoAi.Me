/**
 * Settings. Uses existing GET/PUT /api/settings.
 * No new endpoints.
 */
import { apiClient } from "@/lib/api";
import type { SettingsItem } from "./types";

const SETTINGS_URL = "/api/settings";

export async function getSettings(): Promise<Record<string, SettingsItem>> {
  const res = await apiClient.get<{ settings?: Record<string, { value: unknown; description?: string; updated_at?: string }> }>(SETTINGS_URL);
  if (res.success && res.data) {
    const raw = (res.data as any).settings ?? res.data;
    if (typeof raw === "object" && raw !== null) {
      const out: Record<string, SettingsItem> = {};
      for (const [key, v] of Object.entries(raw)) {
        const val = v as { value?: unknown; description?: string; updated_at?: string };
        out[key] = {
          key,
          value: val.value,
          description: val.description ?? null,
          updated_at: val.updated_at ?? null,
        };
      }
      return out;
    }
  }
  return {};
}

/**
 * Update settings. Uses existing PUT /api/settings. Body: { key1: value1, ... }
 */
export async function updateSettings(updates: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const r = await apiClient.put(SETTINGS_URL, { body: updates });
  if (r.success) return { success: true };
  return { success: false, error: r.error ?? "Failed to update settings" };
}
