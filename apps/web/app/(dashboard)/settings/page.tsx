"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { isSupabaseConfigured } from "@/lib/supabase/client";

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
  const configured = isSupabaseConfigured();

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Settings
      </Typography>
      <Paper sx={{ p: 2, maxWidth: 560 }}>
        {!configured && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Supabase 환경 변수가 누락되어 일부 기능이 비활성화되었습니다. `.env.local`에
            `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정해 주세요.
          </Alert>
        )}
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
