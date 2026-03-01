"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Chip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getChannelsAndContents, deleteChannel } from "@/src/services/youtubeService";
import type { YoutubeChannel } from "@/src/services/types";
import { PageHeader } from "@/lib/materio-layout/PageHeader";
import { EmptyState } from "@/lib/materio-layout/EmptyState";

export default function YoutubeChannelsPage() {
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { channels: ch } = await getChannelsAndContents();
    setChannels(ch);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: string) => {
    const r = await deleteChannel(id);
    if (r.success) load();
    else alert(r.error ?? "Failed");
  };

  return (
    <Box>
      <PageHeader
        title="YouTube — Channels"
        subtitle="Register/delete use existing API when available. Delete is disabled (TODO: DELETE /api/channels/[id])."
        illustrationSrc="/illustrations/illu-char-2.png"
        illustrationWidth={140}
        action={
          <Button variant="contained" startIcon={<AddIcon />} disabled>
            Register channel
          </Button>
        }
      />
      {loading ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableBody>
              <TableRow><TableCell colSpan={7}>Loading...</TableCell></TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      ) : channels.length === 0 ? (
        <EmptyState
          illustrationSrc="/illustrations/illu-char-1.png"
          message="No channels yet"
          secondary="Register a channel to start collecting videos."
          action={
            <Button variant="contained" startIcon={<AddIcon />} disabled>
              Register channel
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Handle</TableCell>
                <TableCell>Last collected</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Monitored</TableCell>
                <TableCell>Videos</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.handle ?? "—"}</TableCell>
                  <TableCell>{c.lastCollectedAt ?? "—"}</TableCell>
                  <TableCell>{c.status ?? "—"}</TableCell>
                  <TableCell>{c.isMonitored ? <Chip label="Yes" size="small" color="primary" /> : "No"}</TableCell>
                  <TableCell>{c.videoCount ?? 0}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleDelete(c.id)} disabled title="TODO: API">
                      <DeleteOutlineIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
