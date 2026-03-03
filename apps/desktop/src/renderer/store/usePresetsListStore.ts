import { create } from "zustand";
import type { PresetRow } from "../../shared/supabase";

interface PresetsListStore {
  presetsList: PresetRow[];
  setPresetsList: (list: PresetRow[]) => void;
}

export const usePresetsListStore = create<PresetsListStore>((set) => ({
  presetsList: [],
  setPresetsList: (list) => set({ presetsList: list }),
}));
