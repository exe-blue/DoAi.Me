"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Skeleton from "@mui/material/Skeleton";
import { getChannels } from "@/services/youtubeService";
import type { ChannelSummary } from "@/services/types";

export default function YoutubeChannelsPage() {
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getChannels().then((list) => {
      if (!cancelled) setChannels(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        YouTube &gt; Channels
      </Typography>
      {loading ? (
        <Skeleton variant="rounded" height={200} />
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Handle</TableCell>
              <TableCell>Videos</TableCell>
              <TableCell>Last collected</TableCell>
              <TableCell>Monitored</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {channels.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ color: "text.secondary" }}>
                  No channels.
                </TableCell>
              </TableRow>
            )}
            {channels.map((ch) => (
              <TableRow key={ch.id}>
                <TableCell>{ch.name}</TableCell>
                <TableCell>{ch.handle ?? "—"}</TableCell>
                <TableCell>{ch.video_count ?? "—"}</TableCell>
                <TableCell>
                  {ch.last_collected_at
                    ? new Date(ch.last_collected_at).toLocaleString()
                    : "—"}
                </TableCell>
                <TableCell>{ch.is_monitored ? "Yes" : "No"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>
        Register / disable / delete: connect when API supports (TODO).
      </Typography>
    </Box>
  );
}
