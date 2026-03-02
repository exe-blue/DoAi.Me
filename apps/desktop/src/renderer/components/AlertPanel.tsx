import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import CloseIcon from "@mui/icons-material/Close";
import { useAlertStore } from "../store/useAlertStore";

export function AlertPanel() {
  const alerts = useAlertStore((s) => s.alerts);
  const clearAlerts = useAlertStore((s) => s.clearAlerts);
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleExportDiagnostic = (serial?: string) => {
    window.electronAPI?.exportDiagnostic(serial ? { serials: [serial] } : undefined);
  };

  return (
    <Paper>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="subtitle2">
          Alerts{alerts.length > 0 && ` (${alerts.length})`}
        </Typography>
        <Button
          size="small"
          color="error"
          onClick={() => setConfirmClear(true)}
          disabled={alerts.length === 0}
        >
          Clear All
        </Button>
      </Box>

      {alerts.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No alerts. All systems nominal.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 90 }}>Time</TableCell>
                <TableCell sx={{ width: 90 }}>Severity</TableCell>
                <TableCell sx={{ width: 160 }}>Device</TableCell>
                <TableCell sx={{ width: 140 }}>Type</TableCell>
                <TableCell>Message</TableCell>
                <TableCell sx={{ width: 160 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow
                  key={alert.id}
                  sx={{
                    backgroundColor:
                      alert.severity === "ERROR" ? "rgba(234,84,85,0.08)" : undefined,
                  }}
                >
                  <TableCell
                    sx={{
                      borderLeft:
                        alert.severity === "ERROR"
                          ? "4px solid #EA5455"
                          : "4px solid transparent",
                      whiteSpace: "nowrap",
                      fontSize: 11,
                    }}
                  >
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alert.severity}
                      size="small"
                      color={alert.severity === "ERROR" ? "error" : "warning"}
                    />
                  </TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }}>
                    {alert.serial ?? "—"}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{alert.type}</TableCell>
                  <TableCell
                    sx={{
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                    }}
                    title={alert.message}
                  >
                    {alert.message}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleExportDiagnostic(alert.serial)}
                        sx={{ fontSize: 11, py: 0.25, px: 0.75 }}
                      >
                        Diagnose
                      </Button>
                      <IconButton
                        size="small"
                        onClick={() => removeAlert(alert.id)}
                        title="Dismiss"
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle>Clear All Alerts?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove all {alerts.length} alert{alerts.length !== 1 ? "s" : ""}.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              clearAlerts();
              setConfirmClear(false);
            }}
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
