/**
 * Preload: expose safe APIs to renderer via contextBridge. IPC with zod validation later.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agent", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  setConfig: (config: unknown) => ipcRenderer.invoke("config:set", config),
  getLoginItemSettings: () => ipcRenderer.invoke("login-item:get"),
  setLoginItemSettings: (openAtLogin: boolean) => ipcRenderer.invoke("login-item:set", openAtLogin),
  onLog: (cb: (line: string) => void) => {
    ipcRenderer.on("log:line", (_e, line) => cb(line));
  },
});
