"use client";

import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { getLogs, getLogDetail } from "@/services/eventsService";
import type { EventLogEntry, EventLogDetail } from "@/services/types";

export default function EventsPage() {
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>("");
  const [limit, setLimit] = useState(100);
  const [detail, setDetail] = useState<EventLogDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    getLogs({ limit, level: level || undefined }).then((list) => {
      setLogs(list);
      setLoading(false);
    });
  }, [limit, level]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  async function handleRowClick(log: EventLogEntry) {
    if (!log.id) return;
    const d = await getLogDetail(log.id);
    setDetail(d);
    setDetailOpen(true);
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Events / Logs
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Level</InputLabel>
          <Select
            label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="info">info</MenuItem>
            <MenuItem value="warn">warn</MenuItem>
            <MenuItem value="error">error</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="number"
          label="Limit"
          value={limit}
          onChange={(e) => setLimit(Math.max(10, parseInt(e.target.value, 10) || 100))}
          sx={{ width: 100 }}
        />
      </Box>
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Level</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Task / Device</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                  No logs.
                </TableCell>
              </TableRow>
            )}
            {logs.map((log, i) => (
              <TableRow
                key={log.id ?? i}
                hover
                sx={{ cursor: log.id ? "pointer" : "default" }}
                onClick={() => log.id && handleRowClick(log)}
              >
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell>{log.level}</TableCell>
                <TableCell sx={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.message}
                </TableCell>
                <TableCell>
                  {log.task_id ?? log.device_serial ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Log detail</DialogTitle>
        <DialogContent>
          {detail ? (
            <Box component="pre" sx={{ fontSize: 12, overflow: "auto", whiteSpace: "pre-wrap" }}>
              {JSON.stringify(detail.raw, null, 2)}
            </Box>
          ) : (
            <Typography color="text.secondary">Loading…</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
