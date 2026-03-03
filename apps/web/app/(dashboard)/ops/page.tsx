"use client";

import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { apiClient } from "@/lib/api";
import { getKpis, getAlerts, getWorkers } from "@/services/operationsService";
import type { OperationsKpis, OperationsAlert } from "@/services/types";
import type { WorkerSummary } from "@/services/types";

const PENDING_STALE_MS = 10 * 60 * 1000; // 10 min

type PendingCommand = { id: string; pc_id: string | null; preset: string; serial?: string | null; created_at: string | null };

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

  const fetchPending = useCallback(async () => {
    const res = await apiClient.get<{ data?: PendingCommand[] }>("/api/preset-commands?status=pending", { silent: true });
    const raw = res.success && res.data ? (res.data as { data?: PendingCommand[] }).data ?? res.data : [];
    setPendingCommands(Array.isArray(raw) ? raw : []);
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
        if (w.length && !presetPcId) setPresetPcId(w[0].pc_number ?? w[0].id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleQueuePreset = async () => {
    const pc_id = presetPcId?.trim();
    if (!pc_id || !presetName.trim()) return;
    setPresetSubmitting(true);
    const res = await apiClient.post<{ data?: unknown }>("/api/preset-commands", {
      body: { pc_id, preset: presetName.trim(), serial: presetSerial.trim() || undefined },
    });
    setPresetSubmitting(false);
    if (res.success) {
      setPresetName("");
      setPresetSerial("");
      fetchPending();
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Operations
      </Typography>

      {loading ? (
        <Grid container spacing={2}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Grid item key={i} xs={12} sm={6} md={4}>
              <Skeleton variant="rounded" height={100} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Online devices
                </Typography>
                <Typography variant="h4">{kpis?.onlineDevices ?? 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Warning devices
                </Typography>
                <Typography variant="h4">{kpis?.warningDevices ?? 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Last heartbeat
                </Typography>
                <Typography variant="body1">
                  {kpis?.lastHeartbeatTime
                    ? new Date(kpis.lastHeartbeatTime).toLocaleString()
                    : "—"}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom>
                  Recent success / failure
                </Typography>
                <Typography variant="body1">
                  {kpis?.recentSuccessCount ?? 0} / {kpis?.recentFailureCount ?? 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      <Typography variant="h6" sx={{ mb: 1 }}>
        Alerts
      </Typography>
      {alerts.length === 0 && !loading && (
        <Typography color="text.secondary">No alerts.</Typography>
      )}
      {alerts.length > 0 && (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {alerts.map((a) => (
            <li key={a.id}>
              <Typography variant="body2">
                [{a.severity}] {a.message}
              </Typography>
            </li>
          ))}
        </Box>
      )}

      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Preset commands (대상 PC 지정)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        생성 시 반드시 대상 PC를 선택하세요. 선택한 PC의 agent만 해당 pending을 소비합니다. (기본값 PC00 사용 금지)
      </Typography>
      <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Grid item>
          <FormControl size="small" required sx={{ minWidth: 140 }}>
            <InputLabel>대상 PC</InputLabel>
            <Select
              label="대상 PC"
              value={presetPcId}
              onChange={(e) => setPresetPcId(e.target.value)}
            >
              {workers.map((w) => (
                <MenuItem key={w.id} value={w.pc_number ?? w.id}>
                  {w.pc_number ?? w.hostname ?? w.id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item>
          <TextField
            size="small"
            label="Preset"
            required
            placeholder="예: P1"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            sx={{ minWidth: 100 }}
          />
        </Grid>
        <Grid item>
          <TextField
            size="small"
            label="Serial (선택)"
            placeholder="기기 시리얼"
            value={presetSerial}
            onChange={(e) => setPresetSerial(e.target.value)}
          />
        </Grid>
        <Grid item>
          <Button
            variant="contained"
            onClick={handleQueuePreset}
            disabled={!presetPcId?.trim() || !presetName.trim() || presetSubmitting}
          >
            {presetSubmitting ? "등록 중…" : "대기열 추가"}
          </Button>
        </Grid>
      </Grid>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
        Pending 목록 (10분 이상 쌓이면 경고)
      </Typography>
      {pendingCommands.length === 0 ? (
        <Typography variant="body2" color="text.secondary">pending 없음</Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          {pendingCommands.map((row) => {
            const created = row.created_at ? new Date(row.created_at).getTime() : 0;
            const isStale = created && Date.now() - created > PENDING_STALE_MS;
            return (
              <li key={row.id}>
                <Typography variant="body2" sx={{ color: isStale ? "warning.main" : undefined }}>
                  [{row.pc_id ?? "—"}] {row.preset}
                  {row.serial ? ` (${row.serial})` : ""} — {row.created_at ? new Date(row.created_at).toLocaleString() : ""}
                  {isStale ? " ⚠ 10분 이상 pending" : ""}
                </Typography>
              </li>
            );
          })}
        </Box>
      )}

      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
        Search (PC / serial / IP)
      </Typography>
      <TextField
        placeholder="Filter by PC number, serial, or IP…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        size="small"
        sx={{ maxWidth: 400 }}
      />
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
        TODO: Connect to API when query params are supported.
      </Typography>
    </Box>
  );
}
