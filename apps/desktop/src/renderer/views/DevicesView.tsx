import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { fetchDevices } from "../api/client";
import type { DeviceRow } from "../api/client";

export function DevicesView() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  useEffect(() => {
    fetchDevices({ pageSize: 100 }).then((r) => {
      setDevices(r.data);
    });
  }, []);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Devices</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Serial</TableCell>
            <TableCell>IP</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Last seen</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((d) => (
            <TableRow key={d.id} sx={{ bgcolor: d.status === "error" ? "error.light" : undefined }}>
              <TableCell>{d.serial_number ?? d.id}</TableCell>
              <TableCell>{d.connection_id ?? "—"}</TableCell>
              <TableCell>{d.status ?? "—"}</TableCell>
              <TableCell>{d.last_seen ? new Date(d.last_seen).toLocaleString() : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {devices.length === 0 && <Typography color="text.secondary">No devices.</Typography>}
      <Typography variant="caption">Gap reason: TODO</Typography>
    </Box>
  );
}
