/// <reference types="vite/client" />

interface ElectronAPI {
  getLaunchAtLogin: () => Promise<boolean>;
  setLaunchAtLogin: (open: boolean) => Promise<void>;
  exportDiagnostics: () => Promise<{ path: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
