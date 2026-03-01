import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { autoUpdater } from "electron-updater";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

const PRELOAD_PATH = path.join(__dirname, "preload/preload.js");
const LAUNCH_AT_LOGIN_FILE = path.join(app.getPath("userData"), "launch-at-login.json");

function getStoredLaunchAtLogin(): boolean {
  try {
    const data = fs.readFileSync(LAUNCH_AT_LOGIN_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return !!parsed.openAtLogin;
  } catch {
    return false;
  }
}

function setStoredLaunchAtLogin(open: boolean): void {
  try {
    fs.mkdirSync(path.dirname(LAUNCH_AT_LOGIN_FILE), { recursive: true });
    fs.writeFileSync(LAUNCH_AT_LOGIN_FILE, JSON.stringify({ openAtLogin: open }));
  } catch (e) {
    console.error("Failed to persist launch-at-login", e);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const stored = getStoredLaunchAtLogin();
  app.setLoginItemSettings({ openAtLogin: stored });

  if (!isDev && app.isPackaged) {
    try {
      autoUpdater.setFeedURL({
        provider: "github",
        owner: "doai-me",
        repo: "doai.me",
      });
      // Skip check on startup for v1.0; renderer can call "Check for updates" via IPC if exposed
    } catch {
      // ignore
    }
  }

  ipcMain.handle("getLaunchAtLogin", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("setLaunchAtLogin", (_e, open: boolean) => {
    app.setLoginItemSettings({ openAtLogin: open });
    setStoredLaunchAtLogin(open);
  });
  ipcMain.handle("exportDiagnostics", async () => {
    const diagnostics = await exportDiagnosticsZip();
    return diagnostics;
  });

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});

async function exportDiagnosticsZip(): Promise<{ path: string; error?: string }> {
  const os = await import("os");
  const archiver = (await import("archiver")).default;
  const tempDir = os.tmpdir();
  const outPath = path.join(tempDir, `xiaowei-diagnostics-${Date.now()}.zip`);
  return new Promise((resolve) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    const meta: Record<string, unknown> = {
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      pcId: process.env.PC_ID ?? process.env.PC_NUMBER ?? "unknown",
    };
    archive.append(JSON.stringify(meta, null, 2), { name: "meta.json" });

    try {
      const logPath = path.join(app.getPath("userData"), "logs");
      if (fs.existsSync(logPath)) {
        const files = fs.readdirSync(logPath);
        for (const f of files.slice(-5)) {
          const full = path.join(logPath, f);
          if (fs.statSync(full).isFile())
            archive.file(full, { name: `logs/${f}` });
        }
      }
    } catch {
      // ignore
    }

    archive.finalize();
    output.on("close", () => resolve({ path: outPath }));
    archive.on("error", (err?: Error) => resolve({ path: "", error: err?.message ?? "Unknown error" }));
  });
}
