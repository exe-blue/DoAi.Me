import { useEffect, useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import { useLogStore } from "../store/useLogStore";
import { fetchLogs } from "../api/client";
import { commands, isElectron } from "../src";

/** Web API log shape. */
type WebLogRow = { id?: string; created_at?: string; level?: string; message?: string; task_id?: string; device_serial?: string };

const LEVEL_ORDER: Record<string, number> = { ERROR: 0, WARN: 1, INFO: 2, SUCCESS: 3 };

function fullMessage(log: LogEntry): string {
  return `[${new Date(log.timestamp).toISOString()}] [${log.level}] [${log.presetName}] [${log.step}] ${log.serial ? `[${log.serial}] ` : ""}${log.message}`;
}

export function LogsView() {
  const logs = useLogStore((s) => s.logs);
  const [webLogs, setWebLogs] = useState<WebLogRow[]>([]);
  const isDesktop = typeof window !== "undefined" && isElectron();
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [resultFilter, setResultFilter] = useState<"all" | "success" | "failure">("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "1h" | "24h">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"importance" | "time">("importance");
  const [detailLog, setDetailLog] = useState<LogEntry | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktop) return;
    fetchLogs({ limit: 100 }).then(setWebLogs);
  }, [isDesktop]);

  const desktopRows = useMemo(() => {
    if (!isDesktop || !Array.isArray(logs)) return [] as LogEntry[];
    let list = [...logs] as LogEntry[];
    const now = Date.now();
    if (deviceFilter !== "all") {
      list = list.filter((l) => (l.serial ?? "") === deviceFilter);
    }
    if (resultFilter === "success") {
      list = list.filter((l) => l.level === "SUCCESS" || l.level === "INFO");
    } else if (resultFilter === "failure") {
      list = list.filter((l) => l.level === "ERROR" || l.level === "WARN");
    }
    if (timeFilter === "1h") {
      list = list.filter((l) => now - l.timestamp <= 60 * 60 * 1000);
    } else if (timeFilter === "24h") {
      list = list.filter((l) => now - l.timestamp <= 24 * 60 * 60 * 1000);
    }
    if (typeFilter !== "all") {
      list = list.filter((l) => l.presetName === typeFilter || l.step === typeFilter);
    }
    if (sortBy === "importance") {
      list.sort((a, b) => {
        const oa = LEVEL_ORDER[a.level] ?? 4;
        const ob = LEVEL_ORDER[b.level] ?? 4;
        if (oa !== ob) return oa - ob;
        return a.timestamp - b.timestamp;
      });
    } else {
      list.sort((a, b) => b.timestamp - a.timestamp);
    }
    return list;
  }, [isDesktop, logs, deviceFilter, resultFilter, timeFilter, typeFilter, sortBy]);

  const deviceOptions = useMemo(() => {
    if (!isDesktop || !Array.isArray(logs)) return [];
    const serials = [...new Set((logs as LogEntry[]).map((l) => l.serial).filter(Boolean))] as string[];
    return serials.sort();
  }, [isDesktop, logs]);

  const typeOptions = useMemo(() => {
    if (!isDesktop || !Array.isArray(logs)) return [];
    const names = new Set<string>();
    (logs as LogEntry[]).forEach((l) => {
      names.add(l.presetName);
      names.add(l.step);
    });
    return [...names].sort();
  }, [isDesktop, logs]);

  const rows = isDesktop ? desktopRows : webLogs;
  const handleExport = async () => {
    if (!isElectron()) return;
    setExportStatus(null);
    try {
      const result = await commands.exportDiagnostics();
      if (result.canceled) return;
      if (result.error || !result.zipPath) {
        setExportStatus("로그가 없습니다.");
        return;
      }
      setExportStatus("내보냈습니다.");
    } catch {
      setExportStatus("로그가 없습니다.");
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
        <Typography variant="h5">Logs &amp; Events</Typography>
        {isDesktop && (
          <>
            <Button variant="outlined" size="small" onClick={handleExport}>
              내보내기
            </Button>
            {exportStatus && (
              <Typography variant="body2" color={exportStatus === "로그가 없습니다." ? "error" : "text.secondary"}>
                {exportStatus}
              </Typography>
            )}
          </>
        )}
      </Box>

      {isDesktop && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>디바이스별</InputLabel>
            <Select value={deviceFilter} label="디바이스별" onChange={(e) => setDeviceFilter(e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              {deviceOptions.map((s) => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>성공/실패별</InputLabel>
            <Select value={resultFilter} label="성공/실패별" onChange={(e) => setResultFilter(e.target.value as "all" | "success" | "failure")}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="success">성공</MenuItem>
              <MenuItem value="failure">실패</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>시간별</InputLabel>
            <Select value={timeFilter} label="시간별" onChange={(e) => setTimeFilter(e.target.value as "all" | "1h" | "24h")}>
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="1h">최근 1시간</MenuItem>
              <MenuItem value="24h">최근 24시간</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>종류별</InputLabel>
            <Select value={typeFilter} label="종류별" onChange={(e) => setTypeFilter(e.target.value)}>
              <MenuItem value="all">전체</MenuItem>
              {typeOptions.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>정렬</InputLabel>
            <Select value={sortBy} label="정렬" onChange={(e) => setSortBy(e.target.value as "importance" | "time")}>
              <MenuItem value="importance">중요도 순</MenuItem>
              <MenuItem value="time">시간 순</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Time</TableCell>
            <TableCell>Level</TableCell>
            <TableCell>Message</TableCell>
            <TableCell>Preset / Step</TableCell>
            <TableCell>Device</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {isDesktop
            ? (rows as LogEntry[]).map((log, i) => {
                const time = new Date(log.timestamp).toLocaleTimeString("default", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });
                const msg = `[${log.presetName}] [${log.step}] ${log.message}`;
                const levelColor = log.level === "ERROR" ? "error" : log.level === "WARN" ? "warning" : "default";
                return (
                  <TableRow
                    key={`${log.timestamp}-${i}`}
                    onClick={() => setDetailLog(log)}
                    sx={{
                      cursor: "pointer",
                      color: levelColor === "error" ? "error.main" : levelColor === "warning" ? "warning.main" : undefined,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <TableCell>{time}</TableCell>
                    <TableCell>{log.level}</TableCell>
                    <TableCell sx={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis" }}>{msg}</TableCell>
                    <TableCell>{log.presetName} / {log.step}</TableCell>
                    <TableCell>{log.serial ?? "—"}</TableCell>
                  </TableRow>
                );
              })
            : (rows as WebLogRow[]).map((web, i) => (
                <TableRow key={web.id ?? i}>
                  <TableCell>{web.created_at ? new Date(web.created_at).toLocaleString() : "—"}</TableCell>
                  <TableCell>{web.level ?? "—"}</TableCell>
                  <TableCell sx={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>{web.message ?? "—"}</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>{web.task_id ?? web.device_serial ?? "—"}</TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {rows.length === 0 && <Typography color="text.secondary">No logs yet. Run presets or wait for agent events.</Typography>}

      <Dialog open={!!detailLog} onClose={() => setDetailLog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>메시지 전체</DialogTitle>
        <DialogContent>
          <DialogContentText component="div" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12 }}>
            {detailLog ? fullMessage(detailLog) : ""}
          </DialogContentText>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
