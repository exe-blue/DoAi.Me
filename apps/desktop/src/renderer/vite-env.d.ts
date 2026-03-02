/// <reference types="vite/client" />

declare global {
  type PresetId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

  interface Device {
    serial: string;
    state: "device" | "unauthorized" | "offline" | "no_device";
    model?: string;
    ip?: string;
    sdkVersion?: number;
    transportId?: string;
  }

  interface PresetResult {
    presetId: PresetId;
    serial: string;
    overallSuccess: boolean;
    severity: "OK" | "WARN" | "ERROR";
    steps: Array<{
      step: "PRE_CHECK" | "APPLY" | "VERIFY" | "RESULT";
      success: boolean;
      message: string;
      timestamp: number;
      durationMs: number;
    }>;
  }

  interface AppSettings {
    imeId: string;
    screenshotDir: string;
    expectedDeviceCount: number;
  }

  interface LogEntry {
    timestamp: number;
    presetName: string;
    step: "PRE_CHECK" | "APPLY" | "VERIFY" | "RESULT";
    level: "INFO" | "SUCCESS" | "WARN" | "ERROR";
    message: string;
    serial?: string;
  }

  interface AlertItem {
    id: string;
    timestamp: number;
    severity: "WARN" | "ERROR";
    serial?: string;
    type: "UNAUTHORIZED" | "ADB_DOWN" | "CMD_FAILED" | "SCREENSHOT_FAIL" | "VERIFY_FAIL";
    message: string;
  }

  interface ElectronAPI {
    deviceList: () => Promise<Device[]>;
    executePreset: (payload: {
      serial: string[];
      presetId: PresetId;
      options?: Record<string, unknown>;
    }) => Promise<{ results: PresetResult[] }>;
    captureScreenshot: (payload: { serial: string; savePath?: string }) => Promise<{
      success: boolean;
      filePath: string;
      error?: string;
    }>;
    exportDiagnostic: (payload?: { serials?: string[] }) => Promise<{
      zipPath: string;
      error?: string;
      canceled?: boolean;
    }>;
    getSettings: () => Promise<AppSettings>;
    setSettings: (payload: Partial<AppSettings>) => Promise<AppSettings>;
    getLogs: () => Promise<unknown[]>;
    getAlerts: () => Promise<unknown[]>;
    onLogStream: (callback: (entry: unknown) => void) => () => void;
    onDeviceUpdate: (callback: (devices: Device[]) => void) => () => void;
    getLaunchAtLogin: () => Promise<boolean>;
    setLaunchAtLogin: (open: boolean) => Promise<void>;
    exportDiagnostics: () => Promise<{ zipPath: string; error?: string; canceled?: boolean }>;
    saveScreenshot: (payload: { serial: string; savePath?: string }) => Promise<{
      success: boolean;
      filePath: string;
      error?: string;
    }>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
