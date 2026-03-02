import { useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { theme } from "./theme";
import { StatusBoard } from "./views/StatusBoard";
import { DevicesView } from "./views/DevicesView";
import { LogsView } from "./views/LogsView";
import { DiagnosticsView } from "./views/DiagnosticsView";
import { SettingsView } from "./views/SettingsView";

type TabId = "status" | "devices" | "logs" | "diagnostics" | "settings";

export default function App() {
  const [tab, setTab] = useState<TabId>("status");

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab label="Status Board" value="status" />
            <Tab label="Devices" value="devices" />
            <Tab label="Logs" value="logs" />
            <Tab label="Diagnostics" value="diagnostics" />
            <Tab label="Settings" value="settings" />
          </Tabs>
          <Chip label="Internal use only" size="small" sx={{ ml: 2, alignSelf: "center" }} />
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {tab === "status" && <StatusBoard />}
          {tab === "devices" && <DevicesView />}
          {tab === "logs" && <LogsView />}
          {tab === "diagnostics" && <DiagnosticsView />}
          {tab === "settings" && <SettingsView />}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
