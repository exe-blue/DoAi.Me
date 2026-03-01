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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { getChannelsAndContents } from "@/src/services/youtubeService";
import type { YoutubeContent } from "@/src/services/types";
import { PageHeader } from "@/lib/materio-layout/PageHeader";
import { EmptyState } from "@/lib/materio-layout/EmptyState";

export default function YoutubeContentsPage() {
  const [contents, setContents] = useState<YoutubeContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { contents: co } = await getChannelsAndContents();
      setContents(co);
      setLoading(false);
    })();
  }, []);

  return (
    <Box>
      <PageHeader
        title="YouTube — Contents"
        subtitle="Content creation: UI only. Submit disabled until content creation API exists (TODO)."
        illustrationSrc="/illustrations/illu-char-3.png"
        illustrationWidth={140}
        action={
          <Button variant="contained" startIcon={<AddIcon />} disabled>
            Add content
          </Button>
        }
      />
      {loading ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableBody>
              <TableRow><TableCell colSpan={4}>Loading...</TableCell></TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      ) : contents.length === 0 ? (
        <EmptyState
          illustrationSrc="/illustrations/illu-char-4.png"
          message="No contents yet"
          secondary="Add content once the API is available."
          action={
            <Button variant="contained" startIcon={<AddIcon />} disabled>
              Add content
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Channel</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Thumbnail</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {contents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.title}</TableCell>
                  <TableCell>{c.channelName ?? c.channelId}</TableCell>
                  <TableCell>{c.status ?? "—"}</TableCell>
                  <TableCell>{c.thumbnailUrl ? "Yes" : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
