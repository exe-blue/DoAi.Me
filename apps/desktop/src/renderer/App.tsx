import { useState, useEffect } from "react";

declare global {
  interface Window {
    agent?: {
      getConfig: () => Promise<Record<string, unknown>>;
      setConfig: (c: unknown) => Promise<void>;
      getLoginItemSettings?: () => Promise<{ openAtLogin: boolean }>;
      setLoginItemSettings?: (openAtLogin: boolean) => Promise<void>;
    };
  }
}

export function App() {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    window.agent?.getConfig().then(setConfig).catch(() => setConfig({}));
    window.agent?.getLoginItemSettings?.().then((s) => setOpenAtLogin(s.openAtLogin)).catch(() => setOpenAtLogin(null));
  }, [saved]);

  const handleSave = () => {
    window.agent?.setConfig(config).then(() => setSaved(true)).catch(console.error);
  };

  return (
    <div style={{
      padding: 24,
      fontFamily: "system-ui",
      maxWidth: 560,
      background: "var(--doai-bg)",
      color: "var(--doai-text)",
      minHeight: "100vh",
    }}>
      <h1 style={{ color: "var(--doai-primary)", marginBottom: 8 }}>DoAi Agent</h1>
      <p style={{ color: "var(--doai-muted)" }}>Status: Supabase and Xiaowei from config. PC from DB.</p>

      {typeof openAtLogin === "boolean" && (
        <div style={{ marginTop: 16, padding: 12, background: "var(--doai-card)", borderRadius: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={openAtLogin}
              onChange={(e) => {
                const v = e.target.checked;
                window.agent?.setLoginItemSettings?.(v).then(() => setOpenAtLogin(v)).catch(console.error);
              }}
            />
            Launch at startup (로그인 시 자동 실행)
          </label>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--doai-muted)" }}>
            현재: {openAtLogin ? "ON" : "OFF"}
          </p>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Supabase URL</label>
        <input
          type="text"
          value={String(config.supabaseUrl ?? "")}
          onChange={(e) => setConfig((c) => ({ ...c, supabaseUrl: e.target.value }))}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid var(--doai-primary)",
            borderRadius: 6,
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ display: "block", marginBottom: 4, fontWeight: 600 }}>Xiaowei WS URL</label>
        <input
          type="text"
          value={String(config.xiaoweiWsUrl ?? "ws://127.0.0.1:22222/")}
          onChange={(e) => setConfig((c) => ({ ...c, xiaoweiWsUrl: e.target.value }))}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid var(--doai-primary)",
            borderRadius: 6,
            boxSizing: "border-box",
          }}
        />
      </div>
      <button
        type="button"
        onClick={handleSave}
        style={{
          marginTop: 16,
          padding: "10px 20px",
          background: "var(--doai-accent)",
          color: "white",
          border: "none",
          borderRadius: 6,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Save config
      </button>
      {saved && <span style={{ marginLeft: 12, color: "var(--doai-pink)" }}>Saved. Restart app to apply.</span>}
    </div>
  );
}
