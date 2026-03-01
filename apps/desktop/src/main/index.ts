/**
 * DoAi Agent — Electron main process entry.
 * Loads app lifecycle and services (config, logging, supabase, xiaowei, scheduler).
 */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import log from "electron-log";
import { registerAppLifecycle, getConfig, setConfig } from "./app/lifecycle";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Linux: avoid GPU/D-Bus errors in WSL or minimal desktop environments
if (process.platform === "linux") {
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
}

process.on("uncaughtException", (err) => {
  log.error("[Main] uncaughtException", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("[Main] unhandledRejection", reason);
});

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "bridge.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  await registerAppLifecycle();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

ipcMain.handle("config:get", () => getConfig());
ipcMain.handle("config:set", (_e, config: unknown) => {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    setConfig(config as Record<string, unknown>);
  }
});

ipcMain.handle("login-item:get", () => {
  if (process.platform !== "win32") return { openAtLogin: false };
  return app.getLoginItemSettings();
});
ipcMain.handle("login-item:set", (_e, openAtLogin: boolean) => {
  if (process.platform !== "win32") return;
  app.setLoginItemSettings({ openAtLogin });
  setConfig({ openAtLogin });
});
