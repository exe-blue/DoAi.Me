"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Skeleton from "@mui/material/Skeleton";
import { getKpis, getAlerts } from "@/services/operationsService";
import type { OperationsKpis, OperationsAlert } from "@/services/types";

export default function OpsPage() {
  const [kpis, setKpis] = useState<OperationsKpis | null>(null);
  const [alerts, setAlerts] = useState<OperationsAlert[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [k, a] = await Promise.all([getKpis(), getAlerts()]);
      if (!cancelled) {
        setKpis(k);
        setAlerts(a);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
