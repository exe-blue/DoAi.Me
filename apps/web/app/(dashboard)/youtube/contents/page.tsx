"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import { getContents } from "@/services/youtubeService";
import type { ContentSummary } from "@/services/types";

export default function YoutubeContentsPage() {
  const [contents, setContents] = useState<ContentSummary[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        YouTube &gt; Contents
      </Typography>
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
      <Box sx={{ mt: 2 }}>
        <Button variant="outlined" disabled>
          Add content (TODO: no create API)
        </Button>
      </Box>
    </Box>
  );
}
