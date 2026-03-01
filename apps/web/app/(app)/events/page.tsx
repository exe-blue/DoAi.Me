"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  MenuItem,
  Chip,
  FormControlLabel,
  Switch,
  Button,
  Drawer,
  IconButton,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { getEventLogs } from "@/src/services/eventsService";
import type { EventLogItem } from "@/src/services/types";
import { EVENT_TYPES } from "@/src/services/types";
import { PageHeader } from "@/lib/materio-layout/PageHeader";
import { EmptyState } from "@/lib/materio-layout/EmptyState";

const TIME_PRESETS: { label: string; start: string; end: string }[] = [
  { label: "1h", start: "", end: "" },
  { label: "6h", start: "", end: "" },
  { label: "24h", start: "", end: "" },
  { label: "7d", start: "", end: "" },
];
function getPresetRange(preset: string): { start: string; end: string } {
  const end = new Date();
  let start = new Date();
  if (preset === "1h") start.setHours(start.getHours() - 1);
  else if (preset === "6h") start.setHours(start.getHours() - 6);
  else if (preset === "24h") start.setDate(start.getDate() - 1);
  else if (preset === "7d") start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getLevelChipColor(level: string | undefined): "error" | "warning" | "default" {
  if (level === "error" || level === "fatal") return "error";
  if (level === "warn") return "warning";
  return "default";
}

function getCopyButtonLabel(status: "idle" | "ok" | "fail"): string {
  if (status === "ok") return "Copied";
  if (status === "fail") return "Copy failed";
  return "Copy issue template";
}

function buildIssueTemplate(event: EventLogItem): string {
  const payload = event.raw ?? event;
  const rawJson = JSON.stringify(payload, null, 2);
  return `Title: [Events] ${event.eventType} — ${event.message?.slice(0, 50) ?? "(no message)"}
Occurred At: ${event.created_at}
Level: ${event.level}
Event Type: ${event.eventType}
Task ID / Device: ${event.task_id ?? event.device_serial ?? "—"}
Summary: 
Steps: 
Raw Payload: 
\`\`\`json
${rawJson}
\`\`\``;
}

export default function EventsPage() {
  const [logs, setLogs] = useState<EventLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState("");
  const [eventType, setEventType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [includeUndefined, setIncludeUndefined] = useState(true);
  const [timePreset, setTimePreset] = useState("");
  const [selected, setSelected] = useState<EventLogItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "ok" | "fail">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    const range = timePreset ? getPresetRange(timePreset) : { start: "", end: "" };
    const list = await getEventLogs({
      level: level || undefined,
      search: search || undefined,
      eventType: eventType ? (eventType as any) : undefined,
      includeUndefined,
      timeStart: range.start || undefined,
      timeEnd: range.end || undefined,
      limit: 200,
    });
    setLogs(list);
    setLoading(false);
  }, [level, search, eventType, includeUndefined, timePreset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (log: EventLogItem) => {
    setSelected(log);
    setDrawerOpen(true);
  };

  const handleCopyTemplate = useCallback(async () => {
    if (!selected) return;
    const text = buildIssueTemplate(selected);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("ok");
      setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("fail");
      setTimeout(() => setCopyStatus("idle"), 2000);
    }
  }, [selected]);

  return (
    <Box>
      <PageHeader
        title="Events / Logs"
        illustrationSrc="/illustrations/illu-char-5.png"
        illustrationWidth={140}
      />

      {/* Filter Bar */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>Filters</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center" }}>
          <TextField
            select
            size="small"
            label="Time"
            value={timePreset}
            onChange={(e) => setTimePreset(e.target.value)}
            sx={{ minWidth: 80 }}
          >
            <MenuItem value="">All</MenuItem>
            {TIME_PRESETS.map((p) => (
              <MenuItem key={p.label} value={p.label}>{p.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="error">error</MenuItem>
            <MenuItem value="warn">warn</MenuItem>
            <MenuItem value="info">info</MenuItem>
            <MenuItem value="debug">debug</MenuItem>
            <MenuItem value="fatal">fatal</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="">All</MenuItem>
            {EVENT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Search message"
            placeholder="Message search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            sx={{ minWidth: 180 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={includeUndefined}
                onChange={(e) => setIncludeUndefined(e.target.checked)}
                color="primary"
              />
            }
            label="Include Undefined"
          />
          <Button variant="outlined" size="small" onClick={() => load()}>Apply</Button>
        </Box>
      </Paper>

      {/* Event List */}
      {!loading && logs.length === 0 ? (
        <EmptyState
          illustrationSrc="/illustrations/illu-char-2.png"
          message="No events in this range"
          secondary="Adjust filters or wait for new events."
        />
      ) : (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Level</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Task / Device</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6}>Loading...</TableCell></TableRow>
            )}
            {!loading && logs.length > 0 && logs.map((log) => (
              <TableRow
                key={log.id}
                hover
                sx={{
                  cursor: "pointer",
                  ...(log.isUndefined && {
                    bgcolor: "action.hover",
                    borderLeft: "3px solid",
                    borderColor: "warning.main",
                  }),
                }}
                onClick={() => handleSelect(log)}
              >
                <TableCell>{log.created_at ? new Date(log.created_at).toLocaleString() : "(no time)"}</TableCell>
                <TableCell>
                  <Chip
                    label={log.level || "unknown"}
                    size="small"
                    color={getLevelChipColor(log.level)}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={log.eventType}
                    size="small"
                    color={log.eventType === "unknown" ? "warning" : "default"}
                    variant={log.eventType === "unknown" ? "filled" : "outlined"}
                  />
                </TableCell>
                <TableCell sx={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.message || "(empty)"}
                </TableCell>
                <TableCell>{log.task_id ?? log.device_serial ?? "—"}</TableCell>
                <TableCell>View</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      )}

      {/* Detail Drawer */}
      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}
      >
        <Box sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6">Event detail</Typography>
            <IconButton onClick={() => setDrawerOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          {selected && (
            <>
              {selected.isUndefined && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Unknown event type or non-standard payload. Raw JSON shown below.
                </Alert>
              )}
              <Typography variant="body2" color="text.secondary">Time</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                {selected.created_at ? new Date(selected.created_at).toLocaleString() : "(no time)"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Level</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{selected.level || "unknown"}</Typography>
              <Typography variant="body2" color="text.secondary">Type</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <Chip
                  label={selected.eventType}
                  size="small"
                  color={selected.eventType === "unknown" ? "warning" : "default"}
                  variant="outlined"
                />
              </Typography>
              <Typography variant="body2" color="text.secondary">Message</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>{selected.message || "(empty)"}</Typography>
              <Typography variant="body2" color="text.secondary">Task ID / Device</Typography>
              <Typography variant="body1" sx={{ mb: 2 }}>
                {selected.task_id ?? selected.device_serial ?? "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">Payload (raw)</Typography>
              <Box
                component="pre"
                sx={{
                  p: 1,
                  bgcolor: "grey.900",
                  borderRadius: 1,
                  overflow: "auto",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  flex: 1,
                }}
              >
                {JSON.stringify(selected.raw ?? selected, null, 2)}
              </Box>
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={handleCopyTemplate}
                sx={{ mt: 2 }}
              >
                {getCopyButtonLabel(copyStatus)}
              </Button>
            </>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
