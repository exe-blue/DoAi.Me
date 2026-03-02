import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useLogStore } from "../store/useLogStore";

type LogFilter = "all" | "errors" | "current";

const LEVEL_COLOR: Record<string, string> = {
  INFO: "#e0e0e0",
  SUCCESS: "#28C76F",
  WARN: "#FF9F43",
  ERROR: "#EA5455",
};

function formatTime(ts: number) {
  const d = new Date(ts);
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":") + "." + String(d.getMilliseconds()).padStart(3, "0");
}

function logToText(log: LogEntry) {
  return `[${formatTime(log.timestamp)}] [${log.presetName}] [${log.step}] ${log.message}`;
}

export function LogPanel() {
  const logs = useLogStore((s) => s.logs);
  const clearLogs = useLogStore((s) => s.clearLogs);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [currentPreset, setCurrentPreset] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track latest preset for "current" filter
  useEffect(() => {
    if (logs.length > 0) setCurrentPreset(logs[logs.length - 1].presetName);
  }, [logs]);

  // Auto-scroll to bottom on new entries (only if user hasn't scrolled up)
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  };

  const filteredLogs = useMemo(() => {
    switch (filter) {
      case "errors":
        return logs.filter((l) => l.level === "ERROR" || l.level === "WARN");
      case "current":
        return currentPreset ? logs.filter((l) => l.presetName === currentPreset) : logs;
      default:
        return logs;
    }
  }, [logs, filter, currentPreset]);

  const handleCopy = () => {
    navigator.clipboard.writeText(filteredLogs.map(logToText).join("\n"));
  };

  const handleExport = () => {
    const text = filteredLogs.map(logToText).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs_${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Paper sx={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 400 }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Typography variant="subtitle2" sx={{ mr: 0.5 }}>
          Logs
        </Typography>
        <Chip
          label="All"
          size="small"
          onClick={() => setFilter("all")}
          color={filter === "all" ? "primary" : "default"}
        />
        <Chip
          label="Errors"
          size="small"
          onClick={() => setFilter("errors")}
          color={filter === "errors" ? "error" : "default"}
        />
        <Chip
          label="Current Preset"
          size="small"
          onClick={() => setFilter("current")}
          color={filter === "current" ? "primary" : "default"}
          disabled={!currentPreset}
        />
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {filteredLogs.length} / {logs.length}
        </Typography>
        <IconButton size="small" onClick={handleCopy} title="Copy to clipboard">
          <ContentCopyIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={handleExport} title="Export .log">
          <FileDownloadIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={clearLogs} title="Clear logs">
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Log area */}
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          overflow: "auto",
          p: 1.5,
          fontFamily: "monospace",
          fontSize: 11,
          lineHeight: 1.7,
          backgroundColor: "#1a1a2e",
          color: "#e0e0e0",
        }}
      >
        {filteredLogs.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            No logs yet. Run a preset to see output here.
          </Typography>
        ) : (
          filteredLogs.map((log, i) => (
            <Box key={i} component="div" sx={{ color: LEVEL_COLOR[log.level] ?? "#e0e0e0" }}>
              {logToText(log)}
            </Box>
          ))
        )}
        <div ref={bottomRef} />
      </Box>
    </Paper>
  );
}
