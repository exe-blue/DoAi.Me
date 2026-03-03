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
import { getDevices } from "@/services/operationsService";

export default function DevicesPage() {
  const [data, setData] = useState<{ data: Array<{ id: string; serial_number?: string; serial?: string; status: string; nickname?: string | null; last_seen?: string | null }>; total: number }>({ data: [], total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDevices({ pageSize: 200 }).then((res) => {
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
        Devices
      </Typography>
      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Serial</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Nickname</TableCell>
              <TableCell>Last seen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                  No devices.
                </TableCell>
              </TableRow>
            )}
            {data.data.map((d) => (
              <TableRow key={d.id}>
                <TableCell>{d.serial_number ?? d.serial ?? d.id}</TableCell>
                <TableCell>{d.status}</TableCell>
                <TableCell>{d.nickname ?? "—"}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>
                  {d.last_seen ? new Date(d.last_seen).toLocaleString() : "—"}
                </TableCell>
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
