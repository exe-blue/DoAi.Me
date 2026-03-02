"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Skeleton from "@mui/material/Skeleton";
import { getLogs } from "@/services/eventsService";
import type { EventLogEntry } from "@/services/types";

export default function EventsPage() {
  const [logs, setLogs] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getLogs({ limit: 100 }).then((list) => {
      if (!cancelled) setLogs(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Events / Logs
      </Typography>
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
              <TableRow key={log.id ?? i}>
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
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
        Detail (single log JSON): TODO when API exists.
      </Typography>
    </Box>
  );
}
