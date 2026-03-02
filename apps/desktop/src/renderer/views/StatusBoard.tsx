import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import { KpiCards } from "../components/KpiCards";
import { WorkPanel } from "../components/WorkPanel";
import { LogPanel } from "../components/LogPanel";
import { AlertPanel } from "../components/AlertPanel";
import { useDeviceStore } from "../store/useDeviceStore";
import { useLogStore } from "../store/useLogStore";
import { useAlertStore } from "../store/useAlertStore";
import { usePresetStore } from "../store/usePresetStore";

export function StatusBoard() {
  const setDevices = useDeviceStore((s) => s.setDevices);
  const addLog = useLogStore((s) => s.addLog);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setExpectedDeviceCount = usePresetStore((s) => s.setExpectedDeviceCount);
  const setImeId = usePresetStore((s) => s.setImeId);
  const setScreenshotPath = usePresetStore((s) => s.setScreenshotPath);
  const [agentState, setAgentState] = useState<AgentState | null>(null);

  // Subscribe to real-time push events from main process
  useEffect(() => {
    const unsubDevice = window.electronAPI?.onDeviceUpdate((devices) => {
      setDevices(devices);
    });

    const unsubLog = window.electronAPI?.onLogStream((entry) => {
      const log = entry as LogEntry;
      addLog(log);

      // Derive alerts from ERROR/WARN log entries
      if (log.level === "ERROR" || log.level === "WARN") {
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

    const unsubAgent = window.electronAPI?.onAgentState((state) => setAgentState(state));

    return () => {
      unsubDevice?.();
      unsubLog?.();
      unsubAgent?.();
    };
  }, [setDevices, addLog, addAlert]);

  // Load initial state from main process on mount
  useEffect(() => {
    window.electronAPI?.deviceList().then(setDevices).catch(() => {});

    window.electronAPI?.getAgentState().then(setAgentState).catch(() => {});

    window.electronAPI
      ?.getSettings()
      .then((s) => {
        if (s.expectedDeviceCount) setExpectedDeviceCount(s.expectedDeviceCount);
        if (s.imeId) setImeId(s.imeId);
        if (s.screenshotDir) setScreenshotPath(s.screenshotDir);
      })
      .catch(() => {});

    window.electronAPI
      ?.getAlerts()
      .then((raw) => {
        (raw as AlertItem[]).forEach(addAlert);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const agentColor = agentState?.status === "RUNNING" ? "success" : agentState?.status === "ERROR" ? "error" : "default";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {window.electronAPI && agentState != null && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Typography variant="subtitle2" color="text.secondary">
            Agent
          </Typography>
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
          <Button size="small" variant="outlined" onClick={() => window.electronAPI?.restartAgent().then(setAgentState)}>
            Restart agent
          </Button>
          {agentState.status === "ERROR" && (
            <Typography variant="caption" color="error">
              Export diagnostics and check agent logs.
            </Typography>
          )}
        </Box>
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
