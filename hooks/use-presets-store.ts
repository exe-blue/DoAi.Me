import { create } from "zustand";
import type { CommandPreset } from "@/lib/types";
import type { PresetRow, Json } from "@/lib/supabase/types";
import { toast } from "@/hooks/use-toast";

function mapPresetRow(row: PresetRow): CommandPreset {
  const config = row.config as Record<string, unknown> | null;
  return {
    id: row.id,
    name: row.name,
    type: row.type as CommandPreset["type"],
    command: typeof config?.command === "string" ? config.command : "",
    description: row.description ?? "",
    createdAt: row.created_at,
    updatedAt: row.created_at,
  };
}

interface PresetsState {
  presets: CommandPreset[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (preset: {
    name: string;
    type: string;
    description?: string;
    config: Json;
  }) => Promise<void>;
  update: (
    id: string,
    fields: Partial<{ name: string; type: string; description: string; config: Json }>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/presets");
      if (!res.ok) throw new Error("Failed to fetch presets");
      const { presets } = (await res.json()) as { presets: PresetRow[] };
      set({ presets: presets.map(mapPresetRow), loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
  create: async (preset) => {
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preset),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create preset");
      }
      await get().fetch();
      toast({
        title: "Preset created",
        description: `Successfully created preset "${preset.name}"`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create preset",
        variant: "destructive",
      });
      throw err;
    }
  },
  update: async (id, fields) => {
    try {
      const res = await fetch(`/api/presets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update preset");
      }
      await get().fetch();
      toast({
        title: "Preset updated",
        description: "Successfully updated preset",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update preset",
        variant: "destructive",
      });
      throw err;
    }
  },
  remove: async (id) => {
    try {
      const res = await fetch(`/api/presets/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete preset");
      }
      await get().fetch();
      toast({
        title: "Preset deleted",
        description: "Successfully deleted preset",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete preset",
        variant: "destructive",
      });
      throw err;
    }
  },
}));
