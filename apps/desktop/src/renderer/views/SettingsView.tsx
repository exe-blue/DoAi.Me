import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";

export function SettingsView() {
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getLaunchAtLogin().then((v) => {
        setLaunchAtLogin(v);
        setReady(true);
      });
    } else setReady(true);
  }, []);

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.checked;
    setLaunchAtLogin(v);
    window.electronAPI?.setLaunchAtLogin(v);
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Settings
      </Typography>
      {ready && window.electronAPI && (
        <FormControlLabel
          control={<Switch checked={launchAtLogin} onChange={handleToggle} />}
          label="Launch at startup (ON/OFF)"
        />
      )}
      {!window.electronAPI && (
        <Typography color="text.secondary">Electron API not available (e.g. browser).</Typography>
      )}
    </Box>
  );
}
