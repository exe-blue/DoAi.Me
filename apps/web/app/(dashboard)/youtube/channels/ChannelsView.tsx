"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Avatar from "@mui/material/Avatar";
import Switch from "@mui/material/Switch";
import type { ChannelRow } from "@/lib/supabase/types";
import { createBrowserClient } from "@/lib/supabase/client";
import { registerChannel, setChannelMonitoring, removeChannel } from "./actions";

export function ChannelsView({ initialChannels }: { initialChannels: ChannelRow[] }) {
  const router = useRouter();
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels);
  const [handleInput, setHandleInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setChannels(initialChannels);
  }, [initialChannels]);

  useEffect(() => {
    const supabase = createBrowserClient();
    if (!supabase) return;
    const channel = supabase.channel("channels-list").on("postgres_changes", { event: "*", schema: "public", table: "channels" }, () => {
      router.refresh();
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!handleInput.trim()) return;
    setSubmitting(true);
    setMessage(null);
    const result = await registerChannel(handleInput);
    setSubmitting(false);
    if (result.ok) {
      setHandleInput("");
      setMessage({ type: "success", text: `Registered: ${result.name}` });
      router.refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  }

  async function handleToggleMonitoring(id: string, enabled: boolean) {
    const result = await setChannelMonitoring(id, enabled);
    if (result.ok) router.refresh();
    else setMessage({ type: "error", text: result.error ?? "Update failed" });
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete channel "${name}"?`)) return;
    const result = await removeChannel(id);
    if (result.ok) router.refresh();
    else setMessage({ type: "error", text: result.error ?? "Delete failed" });
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        YouTube &gt; Channels
      </Typography>
      <Box component="form" onSubmit={handleRegister} sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 3 }}>
        <TextField
          size="small"
          label="Handle or URL"
          placeholder="@handle or https://www.youtube.com/@..."
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          sx={{ minWidth: 320 }}
        />
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? "Registering…" : "채널 등록"}
        </Button>
      </Box>
      {message && (
        <Typography color={message.type === "error" ? "error" : "primary"} sx={{ mb: 2 }}>
          {message.text}
        </Typography>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Photo</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Handle</TableCell>
            <TableCell>Subscribers</TableCell>
            <TableCell>Videos</TableCell>
            <TableCell>Last collected</TableCell>
            <TableCell>Monitored</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {channels.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ color: "text.secondary" }}>
                No channels. Register one above.
              </TableCell>
            </TableRow>
          )}
          {channels.map((ch) => (
            <TableRow key={ch.id}>
              <TableCell>
                <Avatar
                  src={ch.thumbnail_url ?? ch.profile_url ?? undefined}
                  alt={ch.name}
                  variant="rounded"
                  sx={{ width: 40, height: 40 }}
                />
              </TableCell>
              <TableCell>{ch.name}</TableCell>
              <TableCell>{ch.handle ?? "—"}</TableCell>
              <TableCell>{ch.subscriber_count ?? "—"}</TableCell>
              <TableCell>{ch.video_count ?? "—"}</TableCell>
              <TableCell>
                {ch.last_collected_at
                  ? new Date(ch.last_collected_at).toLocaleString()
                  : "—"}
              </TableCell>
              <TableCell>
                <Switch
                  size="small"
                  checked={!!ch.is_monitored}
                  onChange={(_, checked) => handleToggleMonitoring(ch.id, checked)}
                />
              </TableCell>
              <TableCell>
                <Button size="small" color="error" onClick={() => handleDelete(ch.id, ch.name)}>
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
