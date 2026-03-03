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
  getAgentState: () => ipcRenderer.invoke("agent:getState"),
  getAgentSettings: () => ipcRenderer.invoke("agent:getSettings") as Promise<{ pc_number?: string | null; xiaowei_ws_url?: string | null; web_dashboard_url?: string | null }>,
  setAgentSettings: (payload: { pc_number?: string | null; xiaowei_ws_url?: string | null; web_dashboard_url?: string | null }) =>
    ipcRenderer.invoke("agent:setSettings", payload) as Promise<{ pc_number?: string | null; xiaowei_ws_url?: string | null; web_dashboard_url?: string | null }>,
  registerChannels: (payload: { webDashboardUrl: string; handles?: string[]; fetchLatest?: number }) =>
    ipcRenderer.invoke("channels:register", payload) as Promise<{ ok: boolean; error?: string; data?: unknown }>,
  registerPc: (payload: { webDashboardUrl: string }) =>
    ipcRenderer.invoke("pcs:register", payload) as Promise<{ ok: boolean; pc_number?: string | null; error?: string }>,
  getPresetHistory: () => ipcRenderer.invoke("preset:getHistory"),
  restartAgent: () => ipcRenderer.invoke("agent:restart"),
  onAgentState: (callback: (state: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("agent:state", listener);
    return () => ipcRenderer.removeListener("agent:state", listener);
  },
  onNavigateToTab: (callback: (tab: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, tab: string) => callback(tab);
    ipcRenderer.on("app:navigate-tab", listener);
    return () => ipcRenderer.removeListener("app:navigate-tab", listener);
  },
  getAppPath: () => ipcRenderer.invoke("getAppPath"),
  getSupabaseConfig: () => ipcRenderer.invoke("getSupabaseConfig") as Promise<{ url: string; anonKey: string }>,
  openAgentLogsFolder: () =>
    ipcRenderer.invoke("agent:openLogsFolder") as Promise<{ ok: boolean; error?: string }>,
});
