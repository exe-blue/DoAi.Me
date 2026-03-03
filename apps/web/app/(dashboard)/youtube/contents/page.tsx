"use client";

import { useEffect, useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Skeleton from "@mui/material/Skeleton";
import { getContents } from "@/services/youtubeService";
import { registerContent } from "./actions";
import type { ContentSummary } from "@/services/types";

export default function YoutubeContentsPage() {
  const [contents, setContents] = useState<ContentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const refresh = useCallback(() => {
    getContents().then(setContents);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getContents().then((list) => {
      if (!cancelled) setContents(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddContent(e: React.FormEvent) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setSubmitting(true);
    setMessage(null);
    const result = await registerContent(urlInput.trim());
    setSubmitting(false);
    if (result.ok) {
      setUrlInput("");
      setMessage({ type: "success", text: `Added: ${result.title}` });
      refresh();
    } else {
      setMessage({ type: "error", text: result.error ?? "Failed" });
    }
  }

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        YouTube &gt; Contents
      </Typography>
      <Box component="form" onSubmit={handleAddContent} sx={{ display: "flex", gap: 2, alignItems: "flex-start", mb: 2 }}>
        <TextField
          size="small"
          label="Video URL or ID"
          placeholder="https://www.youtube.com/watch?v=... or video ID"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          sx={{ minWidth: 320 }}
        />
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? "Adding…" : "Add content"}
        </Button>
      </Box>
      {message && (
        <Typography color={message.type === "error" ? "error" : "primary"} sx={{ mb: 2 }}>
          {message.text}
        </Typography>
      )}
      {loading ? (
        <Skeleton variant="rounded" height={200} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Channel</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contents.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ color: "text.secondary" }}>
                  No contents.
                </TableCell>
              </TableRow>
            )}
            {contents.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.title ?? "—"}</TableCell>
                <TableCell>{c.channel_name ?? c.channel_id ?? "—"}</TableCell>
                <TableCell>{c.duration_sec != null ? `${c.duration_sec}s` : "—"}</TableCell>
                <TableCell>{c.status ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
