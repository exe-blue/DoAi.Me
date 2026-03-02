import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";

export function DiagnosticsView() {
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleExport = async () => {
    if (!window.electronAPI) {
      setStatus("error");
      setMessage("Not running in Electron.");
      return;
    }
    setStatus("idle");
    setMessage("");
    try {
      const result = await window.electronAPI.exportDiagnostics();
      if (result.error) {
        setStatus("error");
        setMessage(result.error);
      } else if (result.canceled) {
        setStatus("idle");
        setMessage("Export canceled.");
      } else {
        setStatus("ok");
        setMessage(`Saved to ${result.zipPath}. No credentials are included.`);
      }
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Export failed.");
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Diagnostics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Export a zip with app version, OS, logs (masked: no tokens/passwords).
      </Typography>
      <Button variant="contained" onClick={handleExport}>
        Export diagnostics
      </Button>
      {status === "ok" && <Alert severity="success" sx={{ mt: 2 }}>{message}</Alert>}
      {status === "error" && <Alert severity="error" sx={{ mt: 2 }}>{message}</Alert>}
    </Box>
  );
}
