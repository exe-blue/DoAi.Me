import { create } from "zustand";

interface PresetStore {
  runningPresets: Record<string, PresetId>;
  lastResult: PresetResult | null;
  imeId: string;
  screenshotPath: string;
  expectedDeviceCount: number;
  setRunning: (serial: string, presetId: PresetId) => void;
  clearRunning: (serial: string) => void;
  setLastResult: (result: PresetResult) => void;
  setImeId: (id: string) => void;
  setScreenshotPath: (path: string) => void;
  setExpectedDeviceCount: (count: number) => void;
}

export const usePresetStore = create<PresetStore>((set) => ({
  runningPresets: {},
  lastResult: null,
  imeId: "com.google.android.inputmethod.korean/.KoreanIME",
  screenshotPath: "C:\\task\\screenshot",
  expectedDeviceCount: 10,
  setRunning: (serial, presetId) =>
    set((s) => ({ runningPresets: { ...s.runningPresets, [serial]: presetId } })),
  clearRunning: (serial) =>
    set((s) => {
      const { [serial]: _, ...rest } = s.runningPresets;
      return { runningPresets: rest };
    }),
  setLastResult: (result) => set({ lastResult: result }),
  setImeId: (imeId) => set({ imeId }),
  setScreenshotPath: (screenshotPath) => set({ screenshotPath }),
  setExpectedDeviceCount: (expectedDeviceCount) => set({ expectedDeviceCount }),
}));
