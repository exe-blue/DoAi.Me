import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Badge from "@mui/material/Badge";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import { keyframes } from "@emotion/react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import DownloadIcon from "@mui/icons-material/Download";
import { useDeviceStore } from "../store/useDeviceStore";
import { usePresetStore } from "../store/usePresetStore";

type Severity = "OK" | "WARN" | "ERROR";

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

interface KpiCardProps {
  label: string;
  value: string | number;
  severity: Severity;
  tooltip?: string;
  badgeCount?: number;
}

function KpiCard({ label, value, severity, tooltip, badgeCount }: KpiCardProps) {
  const theme = useTheme();
  const prevSeverityRef = useRef<Severity>(severity);
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (severity === "ERROR" && prevSeverityRef.current !== "ERROR") {
      setShakeKey((k) => k + 1);
    }
    prevSeverityRef.current = severity;
  }, [severity]);

  const colorMap: Record<Severity, string> = {
    OK: theme.palette.success.main,
    WARN: theme.palette.warning.main,
    ERROR: theme.palette.error.main,
  };
  const color = colorMap[severity];

  const card = (
    <Box
      key={shakeKey}
      sx={{ animation: shakeKey > 0 ? `${shake} 0.5s ease` : undefined }}
    >
      <Card sx={{ borderLeft: `4px solid ${color}`, height: "100%" }}>
        <CardContent sx={{ pb: "12px !important" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
            </Typography>
            {severity === "OK" && <CheckCircleIcon sx={{ color, fontSize: 16 }} />}
            {severity === "WARN" && (
              <WarningAmberIcon sx={{ color, fontSize: 16, animation: `${pulse} 1.5s ease infinite` }} />
            )}
            {severity === "ERROR" && <ErrorOutlineIcon sx={{ color, fontSize: 16 }} />}
          </Box>
          <Typography variant="h5" sx={{ color, fontWeight: 600 }}>
            {badgeCount != null && badgeCount > 0 ? (
              <Badge
                badgeContent={badgeCount}
                color="warning"
                sx={{ "& .MuiBadge-badge": { animation: `${pulse} 1.5s ease infinite` } }}
              >
                <span>{value}</span>
              </Badge>
            ) : (
              value
            )}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );

  return tooltip ? (
    <Tooltip title={tooltip}>
      <span style={{ display: "block" }}>{card}</span>
    </Tooltip>
  ) : (
    card
  );
}

export function KpiCards() {
  const devices = useDeviceStore((s) => s.devices);
  const lastUpdateTime = useDeviceStore((s) => s.lastUpdateTime);
  const lastResult = usePresetStore((s) => s.lastResult);
  const expectedDeviceCount = usePresetStore((s) => s.expectedDeviceCount);

  // Re-render every 2s so ADB health check stays current even if no push events arrive
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();
  const msSinceUpdate = lastUpdateTime > 0 ? now - lastUpdateTime : Infinity;

  const onlineCount = devices.filter((d) => d.state === "device").length;
  const unauthorizedCount = devices.filter((d) => d.state === "unauthorized").length;
  const offlineCount = devices.filter((d) => d.state === "offline").length;

  const adbSeverity: Severity =
    msSinceUpdate > 10000 ? "ERROR" : msSinceUpdate > 6000 ? "WARN" : "OK";

  const onlinePct = expectedDeviceCount > 0 ? onlineCount / expectedDeviceCount : 1;
  const onlineSeverity: Severity =
    onlinePct >= 0.9 ? "OK" : onlinePct >= 0.8 ? "WARN" : "ERROR";

  const unauthSeverity: Severity =
    unauthorizedCount === 0 ? "OK" : unauthorizedCount <= 2 ? "WARN" : "ERROR";

  const offlineSeverity: Severity =
    offlineCount === 0 ? "OK" : offlineCount <= 5 ? "WARN" : "ERROR";

  const lastTaskSeverity: Severity = lastResult ? lastResult.severity : "OK";
  const lastTaskValue = lastResult
    ? `P${lastResult.presetId} ${lastResult.overallSuccess ? "✓" : "✗"}`
    : "N/A";

  const handleExportDiagnostics = () => {
    window.electronAPI?.exportDiagnostics();
  };

  return (
    <Box>
      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs>
          <KpiCard
            label="ADB Server"
            value={adbSeverity === "OK" ? "Online" : adbSeverity === "WARN" ? "Slow" : "Offline"}
            severity={adbSeverity}
            tooltip={lastUpdateTime > 0 ? `Last update ${Math.round(msSinceUpdate / 1000)}s ago` : "No data yet"}
          />
        </Grid>
        <Grid item xs>
          <KpiCard
            label="Online Devices"
            value={`${onlineCount} / ${expectedDeviceCount}`}
            severity={onlineSeverity}
            tooltip={`${Math.round(onlinePct * 100)}% of expected devices online`}
          />
        </Grid>
        <Grid item xs>
          <KpiCard
            label="Unauthorized"
            value={unauthorizedCount}
            severity={unauthSeverity}
            badgeCount={unauthorizedCount > 0 ? unauthorizedCount : undefined}
          />
        </Grid>
        <Grid item xs>
          <KpiCard label="Offline" value={offlineCount} severity={offlineSeverity} />
        </Grid>
        <Grid item xs>
          <KpiCard
            label="Last Task"
            value={lastTaskValue}
            severity={lastTaskSeverity}
            tooltip={lastResult ? `Serial: ${lastResult.serial}` : undefined}
          />
        </Grid>
        <Grid item xs>
          <KpiCard label="App Version" value="v1.0.0" severity="OK" />
        </Grid>
        <Grid item xs="auto" sx={{ display: "flex", alignItems: "center" }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportDiagnostics}
            sx={{ whiteSpace: "nowrap" }}
          >
            Diagnostics
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}
