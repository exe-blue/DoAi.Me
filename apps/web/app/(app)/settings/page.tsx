"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
} from "@mui/material";
import { getSettings } from "@/src/services/settingsService";
import type { SettingsItem } from "@/src/services/types";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, SettingsItem>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setSettings(s);
      setLoading(false);
    })();
  }, []);

  const entries = Object.values(settings);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Settings</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Environment / server URL display only. Edit and save use existing PUT /api/settings when available; otherwise UI is read-only.
      </Alert>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Key</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4}>Loading...</TableCell></TableRow>
            ) : entries.length === 0 ? (
              <TableRow><TableCell colSpan={4}>No settings</TableCell></TableRow>
            ) : (
              entries.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>{s.key}</TableCell>
                  <TableCell>
                    {typeof s.value === "object" ? JSON.stringify(s.value) : String(s.value)}
                  </TableCell>
                  <TableCell>{s.description ?? "—"}</TableCell>
                  <TableCell>{s.updated_at ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
