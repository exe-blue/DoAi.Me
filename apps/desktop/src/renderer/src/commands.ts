/**
 * 클라이언트 전용 명령 모듈.
 * 모든 Main 프로세스 명령(IPC)은 이 src에서 호출합니다.
 * window.electronAPI를 직접 쓰지 말고 여기서 export한 함수/객체를 사용하세요.
 */

function api(): ElectronAPI | undefined {
  return typeof window !== "undefined" ? window.electronAPI : undefined;
}

export function isElectron(): boolean {
  return !!api();
}

export const commands = {
  deviceList: () => api()?.deviceList() ?? Promise.resolve([]),
  executePreset: (payload: { serial: string[]; presetId: PresetId; options?: Record<string, unknown> }) =>
    api()?.executePreset(payload) ?? Promise.resolve({ results: [] }),
  captureScreenshot: (payload: { serial: string; savePath?: string }) =>
    api()?.captureScreenshot(payload) ?? Promise.resolve({ success: false, filePath: "", error: "Unavailable" }),
  exportDiagnostic: (payload?: { serials?: string[] }) =>
    api()?.exportDiagnostic(payload) ?? Promise.resolve({ zipPath: "", error: "Unavailable" }),
  exportDiagnostics: () =>
    api()?.exportDiagnostics() ?? Promise.resolve({ zipPath: "", error: "Unavailable" }),
  getSettings: () => api()?.getSettings() ?? Promise.resolve({ imeId: "", screenshotDir: "", expectedDeviceCount: 10 }),
  setSettings: (payload: Partial<AppSettings>) =>
    api()?.setSettings(payload) ?? Promise.resolve({ imeId: "", screenshotDir: "", expectedDeviceCount: 10 }),
  getLogs: () => api()?.getLogs() ?? Promise.resolve([]),
  getAlerts: () => api()?.getAlerts() ?? Promise.resolve([]),
  onLogStream: (callback: (entry: unknown) => void) => api()?.onLogStream(callback) ?? (() => {}),
  onDeviceUpdate: (callback: (devices: Device[]) => void) => api()?.onDeviceUpdate(callback) ?? (() => {}),
  getLaunchAtLogin: () => api()?.getLaunchAtLogin() ?? Promise.resolve(false),
  setLaunchAtLogin: (open: boolean) => api()?.setLaunchAtLogin(open) ?? Promise.resolve(),
  saveScreenshot: (payload: { serial: string; savePath?: string }) =>
    api()?.saveScreenshot(payload) ?? Promise.resolve({ success: false, filePath: "", error: "Unavailable" }),
  getAgentState: () =>
    api()?.getAgentState() ??
    Promise.resolve({
      status: "STOPPED" as const,
      lastExitCode: null,
      lastErrorLine: "",
      restartCount: 0,
    }),
  getAgentSettings: () =>
    api()?.getAgentSettings() ?? Promise.resolve({ pc_number: null, xiaowei_ws_url: null, web_dashboard_url: null }),
  setAgentSettings: (payload: Partial<AgentSettings>) =>
    api()?.setAgentSettings(payload) ?? Promise.resolve({ pc_number: null, xiaowei_ws_url: null, web_dashboard_url: null }),
  registerChannels: (payload: { webDashboardUrl: string; handles?: string[]; fetchLatest?: number }) =>
    api()?.registerChannels(payload) ?? Promise.resolve({ ok: false, error: "Unavailable" }),
  registerPc: (payload: { webDashboardUrl: string }) =>
    api()?.registerPc(payload) ?? Promise.resolve({ ok: false, error: "Unavailable" }),
  getPresetHistory: () => api()?.getPresetHistory() ?? Promise.resolve([]),
  restartAgent: () =>
    api()?.restartAgent() ??
    Promise.resolve({
      status: "STOPPED" as const,
      lastExitCode: null,
      lastErrorLine: "",
      restartCount: 0,
    }),
  onAgentState: (callback: (state: AgentState) => void) => api()?.onAgentState(callback) ?? (() => {}),
  onNavigateToTab: (callback: (tab: string) => void) => api()?.onNavigateToTab(callback) ?? (() => {}),
  getAppPath: () => api()?.getAppPath() ?? Promise.resolve(""),
  getSupabaseConfig: () =>
    api()?.getSupabaseConfig() ?? Promise.resolve({ url: "", anonKey: "" }),
  openAgentLogsFolder: () =>
    api()?.openAgentLogsFolder() ?? Promise.resolve({ ok: false, error: "Unavailable" }),
};
