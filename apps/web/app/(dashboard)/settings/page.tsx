"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

function maskUrl(url: string): string {
  if (!url || url.length < 20) return "***";
  return url.slice(0, 8) + "…" + url.slice(-8);
}

export default function SettingsPage() {
  const supabaseUrl =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : "";
  const hasAnon =
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Settings
      </Typography>
      <Paper sx={{ p: 2, maxWidth: 560 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Environment (read-only)
        </Typography>
        <List dense disablePadding>
          <ListItem disablePadding>
            <ListItemText
              primary="NEXT_PUBLIC_SUPABASE_URL"
              secondary={maskUrl(supabaseUrl)}
            />
          </ListItem>
          <ListItem disablePadding>
            <ListItemText
              primary="NEXT_PUBLIC_SUPABASE_ANON_KEY"
              secondary={hasAnon ? "Set" : "Not set"}
            />
          </ListItem>
        </List>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          TODO: Save / update not available (no API).
        </Typography>
      </Paper>
    </Box>
  );
}
