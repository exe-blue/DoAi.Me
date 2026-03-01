import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import { fetchWorkers } from "../api/client";
import type { WorkerRow } from "../api/client";

export function StatusBoard() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  useEffect(() => {
    fetchWorkers().then(setWorkers);
  }, []);

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        Status Board
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Active task rule: max 1 dispatched (TODO: no task_queue API).
      </Typography>
      <Grid container spacing={2}>
        {workers.map((w) => (
          <Grid item xs={12} sm={6} md={4} key={w.id}>
            <Card>
              <CardContent>
                <Typography color="text.secondary">
                  PC {w.pc_number ?? w.hostname ?? w.id}
                </Typography>
                <Typography variant="h6">
                  Online: {w.online_count ?? 0} / {w.device_count ?? 0}
                </Typography>
                <Typography variant="body2">Status: {w.status ?? "-"}</Typography>
                <Typography variant="body2">
                  Last heartbeat:{" "}
                  {w.last_heartbeat
                    ? new Date(w.last_heartbeat).toLocaleString()
                    : "-"}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  running/target/gap/timeout/ERROR: TODO
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {workers.length === 0 && (
        <Typography color="text.secondary">No workers.</Typography>
      )}
      <Typography variant="caption" display="block" sx={{ mt: 2 }}>
        Alerts: TODO
      </Typography>
    </Box>
  );
}
