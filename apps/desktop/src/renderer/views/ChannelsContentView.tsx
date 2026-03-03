import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import CardContent from "@mui/material/CardContent";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemButton from "@mui/material/ListItemButton";
import type { SupabaseClient } from "@supabase/supabase-js";

type ChannelRow = {
  id: string;
  name: string;
  handle: string | null;
  thumbnail_url: string | null;
  video_count: number;
  status: string | null;
};

type VideoRow = {
  id: string;
  title: string;
  channel_id: string | null;
  channel_name: string | null;
  thumbnail_url: string | null;
  target_views: number | null;
  completed_views: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

const YOUTUBE_VIDEO_URL = (id: string) => `https://www.youtube.com/watch?v=${id}`;

interface ChannelsContentViewProps {
  supabase: SupabaseClient | null;
}

export function ChannelsContentView({ supabase }: ChannelsContentViewProps) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreList, setMoreList] = useState<VideoRow[]>([]);
  const [moreTitle, setMoreTitle] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("channels")
      .select("id, name, handle, thumbnail_url, video_count, status")
      .order("name")
      .then(({ data }) => setChannels((data as ChannelRow[]) ?? []));
    supabase
      .from("videos")
      .select("id, title, channel_id, channel_name, thumbnail_url, target_views, completed_views, status, created_at, updated_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setVideos((data as VideoRow[]) ?? []));
  }, [supabase]);

  const remaining = videos.filter(
    (v) => (v.status === "active" || !v.status) && ((v.completed_views ?? 0) < (v.target_views ?? 1))
  );
  const watched = videos.filter(
    (v) => v.status === "completed" || (v.target_views != null && (v.completed_views ?? 0) >= v.target_views)
  );

  const openMore = (list: VideoRow[], title: string) => {
    setMoreList(list);
    setMoreTitle(title);
    setMoreOpen(true);
  };

  const openVideo = (id: string) => {
    window.open(YOUTUBE_VIDEO_URL(id), "_blank", "noopener,noreferrer");
  };

  const scrollSx = {
    display: "flex",
    gap: 2,
    overflowX: "auto",
    pb: 1,
    "& > *": { flexShrink: 0 },
  };

  const cardWidth = 180;
  const cardHeight = 220;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", mb: 2 }}>
        <Typography variant="h5">채널 / 컨텐츠</Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => openMore(videos, "전체 영상")}
          disabled={videos.length === 0}
        >
          더 많이보기
        </Button>
      </Box>

      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600, mt: 2, mb: 1 }}>
        등록된 채널
      </Typography>
      <Box sx={scrollSx}>
        {channels.map((ch) => (
          <Card key={ch.id} sx={{ width: cardWidth, height: cardHeight }}>
            <CardMedia
              component="img"
              height="100"
              image={ch.thumbnail_url || undefined}
              alt={ch.name}
              sx={{ objectFit: "cover" }}
            />
            <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="body2" noWrap title={ch.name}>
                {ch.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ch.handle ?? ch.id} · 영상 {ch.video_count}개
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      {channels.length === 0 && (
        <Typography variant="body2" color="text.secondary">등록된 채널이 없습니다.</Typography>
      )}

      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        앞으로 남은 영상
      </Typography>
      <Box sx={scrollSx}>
        {remaining.slice(0, 20).map((v) => (
          <Card
            key={v.id}
            sx={{ width: cardWidth, height: cardHeight, cursor: "pointer" }}
            onClick={() => openVideo(v.id)}
          >
            <CardMedia
              component="img"
              height="100"
              image={v.thumbnail_url || undefined}
              alt={v.title}
              sx={{ objectFit: "cover" }}
            />
            <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="body2" noWrap title={v.title}>
                {v.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {v.channel_name ?? "—"} · {(v.completed_views ?? 0)}/{(v.target_views ?? 0)}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      {remaining.length > 20 && (
        <Button size="small" sx={{ mt: 0.5 }} onClick={() => openMore(remaining, "앞으로 남은 영상")}>
          더 많이보기 ({remaining.length}개)
        </Button>
      )}
      {remaining.length === 0 && (
        <Typography variant="body2" color="text.secondary">남은 영상이 없습니다.</Typography>
      )}

      <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600, mt: 3, mb: 1 }}>
        지금까지 본 영상
      </Typography>
      <Box sx={scrollSx}>
        {watched.slice(0, 20).map((v) => (
          <Card
            key={v.id}
            sx={{ width: cardWidth, height: cardHeight, cursor: "pointer" }}
            onClick={() => openVideo(v.id)}
          >
            <CardMedia
              component="img"
              height="100"
              image={v.thumbnail_url || undefined}
              alt={v.title}
              sx={{ objectFit: "cover" }}
            />
            <CardContent sx={{ py: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="body2" noWrap title={v.title}>
                {v.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {v.channel_name ?? "—"} · {v.updated_at ? new Date(v.updated_at).toLocaleDateString() : "—"}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      {watched.length > 20 && (
        <Button size="small" sx={{ mt: 0.5 }} onClick={() => openMore(watched, "지금까지 본 영상")}>
          더 많이보기 ({watched.length}개)
        </Button>
      )}
      {watched.length === 0 && (
        <Typography variant="body2" color="text.secondary">본 영상이 없습니다.</Typography>
      )}

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{moreTitle}</DialogTitle>
        <DialogContent>
          <List dense>
            {moreList.map((v) => (
              <ListItem key={v.id} disablePadding>
                <ListItemButton onClick={() => { openVideo(v.id); setMoreOpen(false); }}>
                  <ListItemText
                    primary={v.title}
                    secondary={`${v.channel_name ?? "—"} · ${v.created_at ? new Date(v.created_at).toLocaleString() : ""}`}
                    primaryTypographyProps={{ noWrap: true }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
