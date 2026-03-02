import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { fetchLogs } from "../api/client";
import type { LogEntry } from "../api/client";

export function LogsView() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  useEffect(() => {
    fetchLogs({ limit: 100 }).then(setLogs);
  }, []);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Logs / Events</Typography>
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
          {logs.map((log, i) => (
            <TableRow key={log.id ?? i}>
              <TableCell>{log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</TableCell>
              <TableCell>{log.level ?? "—"}</TableCell>
              <TableCell sx={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>{log.message ?? "—"}</TableCell>
              <TableCell>{log.task_id ?? log.device_serial ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {logs.length === 0 && <Typography color="text.secondary">No logs.</Typography>}
      <Typography variant="caption">Raw JSON: TODO</Typography>
    </Box>
  );
}
