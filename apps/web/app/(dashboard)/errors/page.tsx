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
import { getErrors } from "@/services/eventsService";

export default function ErrorsPage() {
  const [data, setData] = useState<{ data: Array<{ id?: string; level: string; message: string; created_at: string; task_id?: string; device_serial?: string }>; total: number }>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getErrors({ hours: 24, pageSize: 100 }).then((res) => {
      if (!cancelled) setData(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Errors
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Last 24 hours (task_logs level=error)
      </Typography>
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Time</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Task / Device</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center" sx={{ color: "text.secondary" }}>
                  No errors.
                </TableCell>
              </TableRow>
            )}
            {data.data.map((log, i) => (
              <TableRow key={log.id ?? i}>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                </TableCell>
                <TableCell sx={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.message}
                </TableCell>
                <TableCell>{log.task_id ?? log.device_serial ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
        Total: {data.total}
      </Typography>
    </Box>
  );
}
