import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getLaunchAtLogin: () => ipcRenderer.invoke("getLaunchAtLogin"),
  setLaunchAtLogin: (open: boolean) => ipcRenderer.invoke("setLaunchAtLogin", open),
  exportDiagnostics: () => ipcRenderer.invoke("exportDiagnostics"),
});
