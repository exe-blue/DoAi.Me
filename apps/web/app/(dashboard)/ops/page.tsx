"use client";

import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getKpis, getAlerts, getWorkers, getPendingPresetCommandsList, queuePresetCommand } from "@/services/operationsService";
import { getLogs } from "@/services/eventsService";
import type { OperationsKpis, OperationsAlert } from "@/services/types";
import type { WorkerSummary } from "@/services/types";
import type { EventLogEntry } from "@/services/types";
import { useRealtimeDashboard } from "@/hooks/use-realtime-dashboard";

const PENDING_STALE_MS = 10 * 60 * 1000; // 10 min

type PendingCommand = { id: string; pc_id: string | null; preset: string; serial?: string | null; created_at: string | null };

function workerLabel(w: WorkerSummary): string {
  const pc = w.pc_number ?? w.id;
  const host = w.hostname ?? "—";
  return `${pc} (${host})`;
}

export default function OpsPage() {
  const [kpis, setKpis] = useState<OperationsKpis | null>(null);
  const [alerts, setAlerts] = useState<OperationsAlert[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [pendingCommands, setPendingCommands] = useState<PendingCommand[]>([]);
  const [presetPcId, setPresetPcId] = useState<string>("");
  const [presetName, setPresetName] = useState("");
  const [presetSerial, setPresetSerial] = useState("");
  const [presetSubmitting, setPresetSubmitting] = useState(false);
  const [logsPcId, setLogsPcId] = useState<string>("");
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchPending = useCallback(async () => {
    const list = await getPendingPresetCommandsList();
    setPendingCommands(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [k, a, w] = await Promise.all([getKpis(), getAlerts(), getWorkers()]);
      if (!cancelled) {
        setKpis(k);
        setAlerts(a);
        setWorkers(w);
        if (w.length) {
        if (!presetPcId) setPresetPcId(w[0].pc_number ?? w[0].id);
        if (!logsPcId) setLogsPcId(w[0].id);
      }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useRealtimeDashboard({
    onKpis: (partial) => {
      setKpis((prev) => (prev ? { ...prev, ...partial } : null));
    },
    onAlert: (alert) => {
      setAlerts((prev) => [...prev, alert]);
    },
  });

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  useEffect(() => {
    if (!logsPcId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    getLogs({ worker_id: logsPcId, limit: 200 })
      .then((list) => {
        if (!cancelled) setLogs(list);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [logsPcId]);

  const handleQueuePreset = async () => {
    const pc_id = presetPcId?.trim();
    if (!pc_id || !presetName.trim()) return;
    setPresetSubmitting(true);
    try {
      await queuePresetCommand({ pc_id, preset: presetName.trim(), serial: presetSerial.trim() || null });
      setPresetName("");
      setPresetSerial("");
      fetchPending();
    } finally {
      setPresetSubmitting(false);
    }
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", py: 1, px: 0 }}>
      <Typography variant="h5" sx={{ flexShrink: 0, mb: 1 }}>
        Operations
      </Typography>

      {loading ? (
        <Grid container spacing={1.5} sx={{ flexShrink: 0, mb: 1.5 }}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item key={i} xs={12} sm={6} md={3}>
              <Skeleton variant="rounded" height={88} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={1.5} sx={{ flexShrink: 0, mb: 1.5 }}>
          {[
            { label: "Online devices", value: String(kpis?.onlineDevices ?? 0) },
            { label: "Warning devices", value: String(kpis?.warningDevices ?? 0) },
            {
              label: "Last heartbeat",
              value: kpis?.lastHeartbeatTime ? new Date(kpis.lastHeartbeatTime).toLocaleString() : "—",
            },
            {
              label: "Success / Failure",
              value: `${kpis?.recentSuccessCount ?? 0} / ${kpis?.recentFailureCount ?? 0}`,
            },
          ].map((item, i) => (
            <Grid item key={i} xs={12} sm={6} md={3}>
              <Card sx={{ height: "100%", minHeight: 88, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                  <Typography color="text.secondary" variant="body2" gutterBottom>
                    {item.label}
                  </Typography>
                  <Typography variant="h6" component="div" noWrap>
                    {item.value}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Grid container spacing={1.5} sx={{ flex: 1, minHeight: 0 }}>
        <Grid item xs={12} md={4} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Alerts</Typography>
          <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover", p: 1 }}>
            {alerts.length === 0 && !loading && (
              <Typography variant="body2" color="text.secondary">No alerts.</Typography>
            )}
            {alerts.length > 0 && (
              <List dense disablePadding>
                {alerts.map((a) => (
                  <ListItemText
                    key={a.id}
                    primary={a.message}
                    secondary={`[${a.severity}] ${a.at ? new Date(a.at).toLocaleString() : ""}`}
                    primaryTypographyProps={{ variant: "body2" }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                ))}
              </List>
            )}
          </Box>
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Preset commands</Typography>
          <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover", p: 1 }}>
            <FormControl size="small" fullWidth sx={{ mb: 1 }}>
              <InputLabel>대상 PC</InputLabel>
              <Select
                label="대상 PC"
                value={presetPcId}
                onChange={(e) => setPresetPcId(e.target.value)}
              >
                {workers.map((w) => (
                  <MenuItem key={w.id} value={w.pc_number ?? w.id}>
                    {workerLabel(w)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center", mb: 1 }}>
              <TextField
                size="small"
                label="Preset"
                placeholder="예: P1"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                sx={{ minWidth: 80 }}
              />
              <TextField
                size="small"
                label="Serial"
                placeholder="선택"
                value={presetSerial}
                onChange={(e) => setPresetSerial(e.target.value)}
                sx={{ minWidth: 100 }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleQueuePreset}
                disabled={!presetPcId?.trim() || !presetName.trim() || presetSubmitting}
              >
                {presetSubmitting ? "등록 중…" : "추가"}
              </Button>
            </Box>
            <Typography variant="caption" color="text.secondary">Pending (10분 이상 시 경고)</Typography>
            {pendingCommands.length === 0 ? (
              <Typography variant="body2" color="text.secondary" display="block">pending 없음</Typography>
            ) : (
              <List dense disablePadding>
                {pendingCommands.map((row) => {
                  const created = row.created_at ? new Date(row.created_at).getTime() : 0;
                  const isStale = created && Date.now() - created > PENDING_STALE_MS;
                  return (
                    <ListItemText
                      key={row.id}
                      primary={`[${row.pc_id ?? "—"}] ${row.preset}${row.serial ? ` (${row.serial})` : ""}`}
                      secondary={row.created_at ? new Date(row.created_at).toLocaleString() + (isStale ? " ⚠" : "") : ""}
                      primaryTypographyProps={{ variant: "body2", sx: isStale ? { color: "warning.main" } : undefined }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  );
                })}
              </List>
            )}
          </Box>
        </Grid>

        <Grid item xs={12} md={4} sx={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Logs (PC별)</Typography>
          <FormControl size="small" sx={{ minWidth: 200, mb: 0.5 }}>
            <InputLabel>PC 선택</InputLabel>
            <Select
              label="PC 선택"
              value={logsPcId}
              onChange={(e) => setLogsPcId(e.target.value)}
            >
              {workers.map((w) => (
                <MenuItem key={w.id} value={w.id}>
                  {workerLabel(w)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover", p: 1 }}>
            {logsLoading && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
            {!logsPcId && !logsLoading && <Typography variant="body2" color="text.secondary">PC를 선택하세요.</Typography>}
            {logsPcId && !logsLoading && logs.length === 0 && <Typography variant="body2" color="text.secondary">로그 없음.</Typography>}
            {logs.length > 0 && (
              <List dense disablePadding>
                {logs.map((entry) => (
                  <ListItemText
                    key={entry.id ?? `${entry.created_at}-${entry.message?.slice(0, 20)}`}
                    primary={entry.message}
                    secondary={`${entry.level ?? ""} ${entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}`}
                    primaryTypographyProps={{ variant: "body2", sx: { fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" } }}
                    secondaryTypographyProps={{ variant: "caption" }}
                  />
                ))}
              </List>
            )}
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ flexShrink: 0, mt: 1 }}>
        <TextField
          placeholder="Filter by PC number, serial, or IP…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          size="small"
          sx={{ maxWidth: 400 }}
        />
      </Box>
    </Box>
  );
}
