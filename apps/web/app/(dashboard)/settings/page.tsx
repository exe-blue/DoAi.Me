"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { createBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/client";

function maskUrl(url: string): string {
  if (!url || url.length < 20) return "***";
  return url.slice(0, 8) + "…" + url.slice(-8);
}

export default function SettingsPage() {
  const [supabaseStatus, setSupabaseStatus] = useState<"checking" | "ok" | "error">("checking");

  const supabaseUrl =
    typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : "";
  const hasAnon =
    typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setSupabaseStatus("error");
      return;
    }
    const supabase = createBrowserClient();
    if (!supabase) {
      setSupabaseStatus("error");
      return;
    }
    supabase.from("settings").select("key").limit(1).then(({ error }) => {
      setSupabaseStatus(error ? "error" : "ok");
    });
  }, []);

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
          <ListItem disablePadding>
            <ListItemText
              primary="Supabase connection"
              secondary={
                supabaseStatus === "checking"
                  ? "Checking…"
                  : supabaseStatus === "ok"
                    ? "Connected"
                    : "Not connected or RLS denied"
              }
              secondaryTypographyProps={{
                color: supabaseStatus === "ok" ? "success.main" : supabaseStatus === "error" ? "error" : "text.secondary",
              }}
            />
          </ListItem>
        </List>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          Config is read from environment. DB settings table can be updated via Supabase dashboard or Edge.
        </Typography>
      </Paper>
    </Box>
  );
}
