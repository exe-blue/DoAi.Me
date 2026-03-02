import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  deviceList: () => ipcRenderer.invoke("device:list"),
  executePreset: (payload: { serial: string[]; presetId: 1 | 2 | 3 | 4 | 5 | 6 | 7; options?: Record<string, unknown> }) =>
    ipcRenderer.invoke("preset:execute", payload),
  captureScreenshot: (payload: { serial: string; savePath?: string }) =>
    ipcRenderer.invoke("screenshot:capture", payload),
  exportDiagnostic: (payload?: { serials?: string[] }) =>
    ipcRenderer.invoke("diagnostic:export", payload),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (payload: { imeId?: string; screenshotDir?: string; expectedDeviceCount?: number }) =>
    ipcRenderer.invoke("settings:set", payload),
  getLogs: () => ipcRenderer.invoke("log:list"),
  getAlerts: () => ipcRenderer.invoke("alert:list"),
  onLogStream: (callback: (entry: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("log:stream", listener);
    return () => ipcRenderer.removeListener("log:stream", listener);
  },
  onDeviceUpdate: (callback: (devices: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("device:update", listener);
    return () => ipcRenderer.removeListener("device:update", listener);
  },
  getLaunchAtLogin: () => ipcRenderer.invoke("getLaunchAtLogin"),
  setLaunchAtLogin: (open: boolean) => ipcRenderer.invoke("setLaunchAtLogin", open),
  exportDiagnostics: () => ipcRenderer.invoke("diagnostic:export"),
  saveScreenshot: (payload: { serial: string; savePath?: string }) =>
    ipcRenderer.invoke("screenshot:capture", payload),
});
