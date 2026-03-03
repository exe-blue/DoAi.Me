import { useState, useEffect } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { theme } from "./theme";
import { StatusBoard } from "./views/StatusBoard";
import { DevicesView } from "./views/DevicesView";
import { LogsView } from "./views/LogsView";
import { SettingsView } from "./views/SettingsView";
import { ChannelsContentView } from "./views/ChannelsContentView";
import { HistoryView } from "./views/HistoryView";
import { LoginView } from "./views/LoginView";
import { useLogStore } from "./store/useLogStore";
import { useAlertStore } from "./store/useAlertStore";
import { usePresetsListStore } from "./store/usePresetsListStore";
import { commands, isElectron } from "./src";
import type { PresetRow } from "../shared/supabase";

type TabId = "status" | "devices" | "logs" | "channels" | "history" | "settings";

export default function App() {
  const [tab, setTab] = useState<TabId>("status");
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const setLogs = useLogStore((s) => s.setLogs);
  const addLog = useLogStore((s) => s.addLog);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setPresetsList = usePresetsListStore((s: { setPresetsList: (list: PresetRow[]) => void }) => s.setPresetsList);

  useEffect(() => {
    const unsub = commands.onNavigateToTab((tab: string) => {
      if (["status", "devices", "logs", "channels", "history", "settings"].includes(tab)) {
        setTab(tab as TabId);
      }
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const config = await commands.getSupabaseConfig();
        if (!config?.url || !config?.anonKey) {
          if (mounted) setLoading(false);
          return;
        }
        const c = createClient(config.url, config.anonKey);
        if (!mounted) return;
        setClient(c);
        const { data } = await c.auth.getSession();
        setSession(data.session ?? null);
        c.auth.onAuthStateChange((_event, s) => setSession(s ?? null));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Desktop: global log stream so Logs tab and Status log panel both get logs
  useEffect(() => {
    if (!session || !isElectron()) return;
    commands
      .getLogs()
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : [];
        setLogs(list as LogEntry[]);
      })
      .catch(() => {});
    const unsub = commands.onLogStream((entry: unknown) => {
      const log = entry as LogEntry;
      addLog(log);
      const msg = log.message ?? "";
      const isOptionalHttpFailure =
        log.step === "PRE_CHECK" &&
        (msg.startsWith("xiaowei_http ") ||
          msg.includes("XIAOWEI_OFFLINE") ||
          msg.includes("fetch failed") ||
          msg.includes("HTTP_NOT_SUPPORTED") ||
          msg.includes("XIAOWEI_HTTP") ||
          msg.includes("XIAOWEI_TIMEOUT") ||
          msg.includes("XIAOWEI_WS_URL not set") ||
          msg.includes("HTTP_DISABLED"));
      if ((log.level === "ERROR" || log.level === "WARN") && !isOptionalHttpFailure) {
        addAlert({
          id: `log-${log.timestamp}-${log.serial ?? "global"}`,
          timestamp: log.timestamp,
          severity: log.level === "ERROR" ? "ERROR" : "WARN",
          serial: log.serial,
          type: "CMD_FAILED",
          message: `[${log.presetName}] [${log.step}] ${log.message}`,
        });
      }
    });
    return () => unsub?.();
  }, [session, setLogs, addLog, addAlert]);

  // Fetch presets from Supabase on login so preset names are available
  useEffect(() => {
    if (!session || !client) return;
    void (async () => {
      try {
        const { data } = await client
          .from("presets")
          .select("*")
          .order("sort_order", { ascending: true, nullsFirst: false });
        setPresetsList((data ?? []) as PresetRow[]);
      } catch {
        setPresetsList([]);
      }
    })();
  }, [session, client, setPresetsList]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
          <Typography color="text.secondary">Loading…</Typography>
        </Box>
      </ThemeProvider>
    );
  }
  if (!client) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", p: 2 }}>
          <Typography color="text.secondary" textAlign="center">
            Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in .env (or environment).
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }
  if (!session) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LoginView supabase={client} onLoggedIn={() => {}} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Status Board" value="status" />
            <Tab label="Devices" value="devices" />
            <Tab label="Logs" value="logs" />
            <Tab label="채널/컨텐츠" value="channels" />
            <Tab label="Settings" value="settings" />
          </Tabs>
          <Chip label="Internal use only" size="small" sx={{ ml: 2, alignSelf: "center" }} />
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {tab === "status" && <StatusBoard supabase={client} />}
          {tab === "devices" && <DevicesView />}
          {tab === "logs" && <LogsView />}
          {tab === "channels" && <ChannelsContentView supabase={client} />}
          {tab === "history" && <HistoryView supabase={client} />}
          {tab === "settings" && <SettingsView supabase={client} />}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
