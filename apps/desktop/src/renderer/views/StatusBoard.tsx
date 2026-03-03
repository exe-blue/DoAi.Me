import { useEffect, useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import type { SupabaseClient } from "@supabase/supabase-js";
import { KpiCards } from "../components/KpiCards";
import { WorkPanel } from "../components/WorkPanel";
import { LogPanel } from "../components/LogPanel";
import { AlertPanel } from "../components/AlertPanel";
import { useDeviceStore } from "../store/useDeviceStore";
import { useAlertStore } from "../store/useAlertStore";
import { usePresetStore } from "../store/usePresetStore";
import { commands, isElectron } from "../src";

const PENDING_STALE_MS = 10 * 60 * 1000; // 10 min

type PendingRow = { id: string; pc_id: string | null; preset: string; created_at: string | null };

export function StatusBoard({ supabase }: { supabase: SupabaseClient | null }) {
  const setDevices = useDeviceStore((s) => s.setDevices);
  const setExpectedDeviceCount = usePresetStore((s) => s.setExpectedDeviceCount);
  const setImeId = usePresetStore((s) => s.setImeId);
  const setScreenshotPath = usePresetStore((s) => s.setScreenshotPath);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [pendingCommands, setPendingCommands] = useState<PendingRow[]>([]);

  // Subscribe to device/agent push events (logs are handled globally in App)
  useEffect(() => {
    const unsubDevice = commands.onDeviceUpdate((devices) => {
      setDevices(devices);
    });
    const unsubAgent = commands.onAgentState((state) => setAgentState(state));
    return () => {
      unsubDevice?.();
      unsubAgent?.();
    };
  }, [setDevices]);

  // Load initial state from main process on mount
  useEffect(() => {
    commands.deviceList().then(setDevices).catch(() => {});

    commands.getAgentState().then(setAgentState).catch(() => {});

    commands
      .getSettings()
      .then((s) => {
        if (s.expectedDeviceCount) setExpectedDeviceCount(s.expectedDeviceCount);
        if (s.imeId) setImeId(s.imeId);
        if (s.screenshotDir) setScreenshotPath(s.screenshotDir);
      })
      .catch(() => {});

    commands
      .getAlerts()
      .then((raw) => {
        (raw as AlertItem[]).forEach(useAlertStore.getState().addAlert);
      })
      .catch(() => {});

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll preset_commands pending for "wrong PC" and "pending > 10 min" warnings
  useEffect(() => {
    if (!supabase) return;
    const fetchPending = async () => {
      const { data } = await supabase
        .from("preset_commands")
        .select("id, pc_id, preset, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .returns<PendingRow[]>();
      setPendingCommands(data ?? []);
    };
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [supabase]);

  const currentPc = agentState?.pc_number ?? null;
  const { wrongPcCount, wrongPcIds, staleCount } = useMemo(() => {
    const now = Date.now();
    let wrong = 0;
    const ids = new Set<string>();
    let stale = 0;
    for (const row of pendingCommands) {
      const pc = row.pc_id?.trim() || null;
      if (pc != null && pc !== "" && currentPc != null && pc !== currentPc) {
        wrong++;
        ids.add(pc);
      }
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      if (created && now - created > PENDING_STALE_MS) stale++;
    }
    return { wrongPcCount: wrong, wrongPcIds: Array.from(ids), staleCount: stale };
  }, [pendingCommands, currentPc]);

  const agentColor = agentState?.status === "RUNNING" ? "success" : agentState?.status === "ERROR" ? "error" : "default";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {isElectron() && agentState != null && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="subtitle2" color="text.secondary">
              Agent
            </Typography>
            {agentState.pc_number != null && agentState.pc_number !== "" && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  현재 대상 PC
                </Typography>
                <Chip label={agentState.pc_number} size="small" variant="outlined" color="primary" />
              </>
            )}
            {wrongPcCount > 0 && (
              <Typography variant="body2" color="error" sx={{ fontWeight: 600 }}>
                ⚠ {wrongPcCount}건 pending이 다른 PC에 쌓임: {wrongPcIds.join(", ")} → 이 PC에서 소비 불가
              </Typography>
            )}
            {staleCount > 0 && (
              <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600 }}>
                ⚠ {staleCount}건 10분 이상 pending (대상 PC에서 처리 지연 가능)
              </Typography>
            )}
            <Chip label={agentState.status} color={agentColor} size="small" />
            {agentState.lastExitCode != null && (
              <Typography variant="caption" color="text.secondary">
                Last exit: {agentState.lastExitCode}
              </Typography>
            )}
            {agentState.lastErrorLine && (
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320 }} noWrap title={agentState.lastErrorLine}>
                {agentState.lastErrorLine}
              </Typography>
            )}
            <Button size="small" variant="outlined" onClick={() => commands.restartAgent().then(setAgentState)}>
              Restart agent
            </Button>
            {agentState.status === "ERROR" && (
              <Typography variant="caption" color="error">
                Export diagnostics and check agent logs.
              </Typography>
            )}
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
            <Typography variant="subtitle2" color="text.secondary">
              WS
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
              {agentState.wsEffectiveUrl ?? "—"}
            </Typography>
            {agentState.wsAttemptNo != null && (
              <Typography variant="caption" color="text.secondary">
                attempt #{agentState.wsAttemptNo}
              </Typography>
            )}
            <Chip
              label={agentState.wsStatus === "CONNECTED" ? "connected" : agentState.wsStatus === "FAILED" ? "disconnected" : (agentState.wsStatus ?? "—")}
              size="small"
              color={
                agentState.wsStatus === "CONNECTED"
                  ? "success"
                  : agentState.wsStatus === "FAILED"
                    ? "error"
                    : "default"
              }
            />
            {agentState.wsStatus === "FAILED" && agentState.wsCloseCode != null && (
              <Typography variant="caption" color="text.secondary">
                closeCode={agentState.wsCloseCode}
                {agentState.wsCloseReason ? ` ${agentState.wsCloseReason}` : ""}
              </Typography>
            )}
            {agentState.wsFailureCategory && agentState.wsStatus === "FAILED" && (
              <Typography variant="caption" color="text.secondary">
                {agentState.wsFailureCategory === "TCP_REFUSED"
                  ? "TCP refused (서버 미실행/포트)"
                  : agentState.wsFailureCategory === "HTTP_4XX"
                    ? "HTTP 400/404 (경로/핸드셰이크)"
                    : agentState.wsFailureCategory === "TIMEOUT"
                      ? "timeout (이벤트/응답 지연)"
                      : "other"}
              </Typography>
            )}
            {agentState.wsLastFailure && (
              <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 400 }} title={agentState.wsLastFailure}>
                Last failure: {agentState.wsLastFailure}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1 }}>
              WebSocket 테스트:{" "}
              <Typography component="a" href="https://wstool.js.org/" target="_blank" rel="noopener noreferrer" variant="caption" sx={{ color: "primary.main" }}>
                https://wstool.js.org/
              </Typography>
            </Typography>
          </Box>
          {agentState.lastPresetResult != null && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Typography variant="subtitle2" color="text.secondary">
                최근 실행된 preset
              </Typography>
              <Typography variant="body2">
                P{agentState.lastPresetResult.presetId} {agentState.lastPresetResult.overallSuccess ? "✓" : "✗"}{" "}
                ({agentState.lastPresetResult.serial})
              </Typography>
            </Box>
          )}
        </>
      )}
      <KpiCards />

      <Grid container spacing={3}>
        <Grid item xs={4}>
          <WorkPanel />
        </Grid>
        <Grid item xs={8}>
          <LogPanel />
        </Grid>
      </Grid>

      <AlertPanel />
    </Box>
  );
}
