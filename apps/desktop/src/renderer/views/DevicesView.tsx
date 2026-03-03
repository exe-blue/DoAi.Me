import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { fetchDevices } from "../api/client";
import type { DeviceRow } from "../api/client";
import { useDeviceStore } from "../store/useDeviceStore";
import { isElectron } from "../src";

type DeviceStateTab = "device" | "unauthorized" | "offline";

function deviceStateLabel(s: DeviceStateTab): string {
  switch (s) {
    case "device":
      return "온라인";
    case "unauthorized":
      return "인증되지않음";
    case "offline":
      return "오프라인";
    default:
      return s;
  }
}

function deviceInfoLabel(d: Device): string {
  if (!d.serial && !d.model) return "정보없음";
  const parts = [d.serial || "", d.model || "", d.ip || ""].filter(Boolean);
  return parts.length ? parts.join(" · ") : "정보없음";
}

export function DevicesView() {
  const [webDevices, setWebDevices] = useState<DeviceRow[]>([]);
  const [deviceTab, setDeviceTab] = useState<DeviceStateTab>("device");
  const devices = useDeviceStore((s) => s.devices);
  const isDesktop = typeof window !== "undefined" && isElectron();

  useEffect(() => {
    if (isDesktop) return;
    fetchDevices({ pageSize: 100 }).then((r) => setWebDevices(r.data ?? []));
  }, [isDesktop]);

  if (isDesktop) {
    const online = devices.filter((d) => d.state === "device");
    const unauthorized = devices.filter((d) => d.state === "unauthorized");
    const offline = devices.filter((d) => d.state === "offline");
    const byTab: Record<DeviceStateTab, Device[]> = {
      device: online,
      unauthorized,
      offline,
    };
    const currentList = byTab[deviceTab];

    return (
      <Box>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Devices
        </Typography>
        <Tabs value={deviceTab} onChange={(_, v) => setDeviceTab(v as DeviceStateTab)} sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
          <Tab label={`온라인 (${online.length})`} value="device" />
          <Tab label={`인증되지않음 (${unauthorized.length})`} value="unauthorized" />
          <Tab label={`오프라인 (${offline.length})`} value="offline" />
        </Tabs>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>상태</TableCell>
              <TableCell>기기 정보</TableCell>
              <TableCell>모델</TableCell>
              <TableCell>IP</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {currentList.map((d) => (
              <TableRow key={d.serial || Math.random()} sx={{ bgcolor: d.state === "unauthorized" ? "warning.light" : d.state === "offline" ? "action.hover" : undefined }}>
                <TableCell>{deviceStateLabel(d.state as DeviceStateTab)}</TableCell>
                <TableCell sx={{ fontFamily: "monospace" }}>{deviceInfoLabel(d)}</TableCell>
                <TableCell>{d.model ?? "—"}</TableCell>
                <TableCell>{d.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {currentList.length === 0 && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            해당 상태의 기기가 없습니다.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Devices
      </Typography>
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
          {webDevices.map((d) => (
            <TableRow key={d.id} sx={{ bgcolor: d.status === "error" ? "error.light" : undefined }}>
              <TableCell>{d.serial_number ?? d.id}</TableCell>
              <TableCell>{d.connection_id ?? "—"}</TableCell>
              <TableCell>{d.status ?? "—"}</TableCell>
              <TableCell>{d.last_seen ? new Date(d.last_seen).toLocaleString() : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {webDevices.length === 0 && <Typography color="text.secondary">No devices.</Typography>}
    </Box>
  );
}
