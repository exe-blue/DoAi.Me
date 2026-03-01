"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import {
  getOperationsKpi,
  getOperationsAlerts,
  getDevices,
  getQueueSlotSummary,
  getTimeoutFailedCounts,
  getActiveTaskSummary,
} from "@/src/services/operationsService";
import type {
  OperationsKpi as KpiT,
  OperationsAlert,
  OperationsDeviceSummary,
  QueueSlotSummary,
  TimeoutFailedCounts,
  ActiveTaskSummary,
} from "@/src/services/types";
import { PageHeader } from "@/lib/materio-layout/PageHeader";
import { BRAND } from "@/lib/materio-layout/MuiTheme";

const RECENT_MINUTES = 60;

export default function OpsPage() {
  const [kpi, setKpi] = useState<KpiT | null>(null);
  const [alerts, setAlerts] = useState<OperationsAlert[]>([]);
  const [devices, setDevices] = useState<OperationsDeviceSummary[]>([]);
  const [deviceTotal, setDeviceTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<QueueSlotSummary[]>([]);
  const [timeoutFailed, setTimeoutFailed] = useState<TimeoutFailedCounts | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveTaskSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [k, a, d, slotList, tf, at] = await Promise.all([
        getOperationsKpi(),
        getOperationsAlerts(),
        getDevices({ page: 1, pageSize: 50 }),
        getQueueSlotSummary(),
        getTimeoutFailedCounts(RECENT_MINUTES),
        getActiveTaskSummary(),
      ]);
      if (!cancelled) {
        setKpi(k);
        setAlerts(a);
        setDevices(d.list);
        setDeviceTotal(d.total);
        setSlots(slotList);
        setTimeoutFailed(tf);
        setActiveTask(at);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!search.trim()) return;
    const t = setTimeout(async () => {
      const d = await getDevices({ q: search, page: 1, pageSize: 50 });
      setDevices(d.list);
      setDeviceTotal(d.total);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const kpiCardSx = {
    borderTop: `3px solid ${BRAND.primary}`,
  };
  const kpiCardAccentSx = {
    borderTop: `3px solid ${BRAND.accent}`,
  };

  return (
    <Box>
      <PageHeader
        title="Operations"
        illustrationSrc="/illustrations/illu-char-1.png"
        illustrationWidth={150}
      />

      {/* KPI cards: top border blue/yellow, 1–2 with sticker */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent sx={{ position: "relative" }}>
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 48,
                  height: 48,
                  opacity: 0.9,
                  display: { xs: "none", sm: "block" },
                }}
                aria-hidden
              >
                <Image src="/illustrations/illu-char-3.png" alt="" width={48} height={48} style={{ objectFit: "contain" }} />
              </Box>
              <Typography color="text.secondary" gutterBottom>Online devices</Typography>
              <Typography variant="h5">{kpi?.onlineDevices ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardAccentSx}>
            <CardContent sx={{ position: "relative" }}>
              <Box
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 48,
                  height: 48,
                  opacity: 0.9,
                  display: { xs: "none", sm: "block" },
                }}
                aria-hidden
              >
                <Image src="/illustrations/illu-char-4.png" alt="" width={48} height={48} style={{ objectFit: "contain" }} />
              </Box>
              <Typography color="text.secondary" gutterBottom>Warning devices</Typography>
              <Typography variant="h5">{kpi?.warningDevices ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Last heartbeat (assumption)</Typography>
              <Typography variant="body2">{kpi?.lastHeartbeatAt ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Recent success / failure</Typography>
              <Typography variant="body1">{kpi?.recentSuccessCount ?? "—"} / {kpi?.recentFailureCount ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Error devices (eligible 제외)</Typography>
              <Typography variant="h5">{kpi?.errorDevices ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>Active task (max 1)</Typography>
              <Typography variant="h5">{activeTask?.activeCount ?? "—"}</Typography>
              <Typography variant="caption">expected ≤ {activeTask?.expectedMax ?? 1}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={kpiCardSx}>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>TIMEOUT / FAILED_FINAL ({RECENT_MINUTES}m)</Typography>
              <Typography variant="body1">{timeoutFailed?.timeoutCount ?? "—"} / {timeoutFailed?.failedFinalCount ?? "—"}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Queue slots: PC별 running / target / gap (ops-queue-spec) */}
      <Typography variant="h6" sx={{ mb: 1 }}>PC slots (running / target / gap)</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxWidth: 560 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PC</TableCell>
              <TableCell align="right">Running</TableCell>
              <TableCell align="right">Target</TableCell>
              <TableCell align="right">Gap</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {slots.length === 0 && !loading && (
              <TableRow><TableCell colSpan={4}>No workers (or stub: running=0, TODO API)</TableCell></TableRow>
            )}
            {slots.map((s) => (
              <TableRow key={s.pcId}>
                <TableCell>{s.pcNumber}</TableCell>
                <TableCell align="right">{s.runningCount}</TableCell>
                <TableCell align="right">{s.target}</TableCell>
                <TableCell align="right">{s.gap}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Alerts</Typography>
          {alerts.map((a) => (
            <Alert key={a.id} severity={a.severity} sx={{ mb: 1 }}>
              <AlertTitle>{a.type}</AlertTitle>
              {a.message} — {a.at}
            </Alert>
          ))}
        </Box>
      )}

      {/* Device search (UI; API used when available) */}
      <Typography variant="h6" sx={{ mb: 1 }}>Devices (PC / serial / IP filter)</Typography>
      <TextField
        size="small"
        placeholder="PC number, serial, IP..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
        sx={{ mb: 2, maxWidth: 360 }}
      />

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>PC / Worker</TableCell>
              <TableCell>Serial</TableCell>
              <TableCell>IP</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last heartbeat</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={5}>Loading...</TableCell></TableRow>
            )}
            {!loading && devices.length === 0 && (
              <TableRow><TableCell colSpan={5}>No devices</TableCell></TableRow>
            )}
            {!loading && devices.length > 0 && (
              devices.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.pcNumber ?? d.id}</TableCell>
                  <TableCell>{d.serial ?? "—"}</TableCell>
                  <TableCell>{d.ip ?? "—"}</TableCell>
                  <TableCell>{d.status}</TableCell>
                  <TableCell>{d.lastHeartbeat ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" sx={{ mt: 1 }}>Total: {deviceTotal}</Typography>
    </Box>
  );
}
