import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Badge from "@mui/material/Badge";
import Tooltip from "@mui/material/Tooltip";
import { useTheme } from "@mui/material/styles";
import { keyframes } from "@emotion/react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
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

  // Re-render every 2s so WebSocket health check stays current even if no push events arrive
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
  const totalCount = devices.length;

  const wsSeverity: Severity =
    msSinceUpdate > 10000 ? "ERROR" : msSinceUpdate > 6000 ? "WARN" : "OK";

  const onlineSeverity: Severity =
    onlineCount > 0 ? "OK" : totalCount > 0 ? "WARN" : "ERROR";

  const unauthSeverity: Severity =
    unauthorizedCount === 0 ? "OK" : unauthorizedCount <= 2 ? "WARN" : "ERROR";

  const offlineSeverity: Severity =
    offlineCount === 0 ? "OK" : offlineCount <= 5 ? "WARN" : "ERROR";

  const totalSeverity: Severity = totalCount > 0 ? "OK" : "ERROR";

  const lastTaskSeverity: Severity = lastResult ? lastResult.severity : "OK";
  const lastTaskValue = lastResult
    ? `P${lastResult.presetId} ${lastResult.overallSuccess ? "✓" : "✗"}`
    : "N/A";

  return (
    <Box>
      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs>
          <KpiCard
            label="WebSocket Server"
            value={wsSeverity === "OK" ? "Online" : wsSeverity === "WARN" ? "Slow" : "Offline"}
            severity={wsSeverity}
            tooltip={lastUpdateTime > 0 ? `Last update ${Math.round(msSinceUpdate / 1000)}s ago` : "No data yet"}
          />
        </Grid>
        <Grid item xs>
          <KpiCard
            label="온라인"
            value={onlineCount}
            severity={onlineSeverity}
            tooltip="연결된 기기 (device)"
          />
        </Grid>
        <Grid item xs>
          <KpiCard
            label="인증안됨"
            value={unauthorizedCount}
            severity={unauthSeverity}
            badgeCount={unauthorizedCount > 0 ? unauthorizedCount : undefined}
          />
        </Grid>
        <Grid item xs>
          <KpiCard label="오프라인" value={offlineCount} severity={offlineSeverity} />
        </Grid>
        <Grid item xs>
          <KpiCard label="전체 기기" value={totalCount} severity={totalSeverity} />
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
      </Grid>
    </Box>
  );
}
