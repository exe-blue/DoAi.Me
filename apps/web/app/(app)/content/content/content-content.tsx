"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import useSWR from "swr";
import { useListApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { type ColumnDef } from "@tanstack/react-table";
import { fetcher, apiClient } from "@/lib/api";
import { DataTable } from "@/components/data-table";
import { DetailSheet } from "@/components/detail-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type TaskItem = {
  id?: string;
  title?: string;
  channelName?: string;
  status?: string;
  priority?: number;
  createdAt?: string;
  source?: string | null;
  videoId?: string;
};


function parseVideoId(url: string): string | null {
  if (!url?.trim()) return null;
  const u = url.trim();
  const vMatch = u.match(/[?&]v=([^&]+)/);
  if (vMatch) return vMatch[1];
  const shortMatch = u.match(/youtu\.be\/([^/?]+)/);
  if (shortMatch) return shortMatch[1];
  const shortsMatch = u.match(/youtube\.com\/shorts\/([^/?]+)/);
  if (shortsMatch) return shortsMatch[1];
  return null;
}

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

/** Parse video duration string (ISO 8601 PT1H2M3S or "H:MM:SS" / "M:SS") to seconds. */
function parseDurationToSeconds(duration: string): number {
  if (!duration?.trim()) return 0;
  const s = duration.trim();
  const iso = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) {
    const h = parseInt(iso[1] ?? "0", 10);
    const m = parseInt(iso[2] ?? "0", 10);
    const sec = parseInt(iso[3] ?? "0", 10);
    return h * 3600 + m * 60 + sec;
  }
  const parts = s.split(":").map((x) => parseInt(x, 10));
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1 && !Number.isNaN(parts[0])) return parts[0];
  return 0;
}

interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  channelTitle: string;
  channelId: string;
  publishedAt?: string;
  viewCount?: string;
}

export function ContentContent() {
  const [statusTab, setStatusTab] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const tasksUrl =
    "/api/tasks" +
    buildQuery({
      page: 1,
      pageSize: 50,
      status: statusTab === "all" ? undefined : statusTab === "failed" ? "error" : statusTab,
    });

  const { list: tasks, error: tasksError, isLoading: tasksLoading, mutate } = useListApi<TaskItem>(tasksUrl);
  const { data: channelsData } = useSWR<{ channels: { id: string; name: string }[] }>("/api/channels", fetcher);
  const channels = channelsData?.channels ?? [];

  const filteredTasks = tasks;

  const columns = useMemo<ColumnDef<TaskItem>[]>(
    () => [
      { id: "title", header: "영상", accessorKey: "title", cell: (c) => (c.getValue() as string) || "—" },
      { id: "channelName", header: "채널", accessorKey: "channelName", cell: (c) => (c.getValue() as string) || "—" },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant="secondary">{v}</Badge> : "—";
        },
      },
      { id: "priority", header: "우선순위", accessorKey: "priority", cell: (c) => c.getValue() ?? "—" },
      { id: "createdAt", header: "생성일", accessorKey: "createdAt", cell: (c) => formatDate(c.getValue() as string) },
      {
        id: "source",
        header: "출처",
        accessorKey: "source",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v === "manual" ? <Badge variant="outline">직접</Badge> : v === "channel_auto" ? <Badge variant="secondary">자동</Badge> : "—";
        },
      },
    ],
    []
  );

  const ensureChannel = async (youtubeChannelId: string, name: string): Promise<string> => {
    const found = channels.find((c) => c.id === youtubeChannelId);
    if (found) return found.id;
    const res = await apiClient.post("/api/channels", {
      body: { name, youtube_channel_id: youtubeChannelId },
      silent: true,
    });
    const data = res.data as { channel?: { id: string } } | undefined;
    if (!res.success || !data?.channel?.id) {
      throw new Error(res.error || "채널 생성 실패");
    }
    return data.channel.id;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="all">전체</TabsTrigger>
            <TabsTrigger value="queued">대기</TabsTrigger>
            <TabsTrigger value="running">진행중</TabsTrigger>
            <TabsTrigger value="completed">완료</TabsTrigger>
            <TabsTrigger value="failed">실패</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          콘텐츠 등록
        </Button>
      </div>

      <DataTable<TaskItem>
        data={filteredTasks}
        columns={columns}
        searchPlaceholder="작업 검색…"
        onRowClick={(row) => {
          setDetailTask(row);
          setSheetOpen(true);
        }}
        loading={tasksLoading}
        error={tasksError ?? null}
        emptyTitle="작업 없음"
        emptyDescription="등록된 콘텐츠가 없습니다. 채널을 등록하거나 위에서 콘텐츠를 추가하세요."
      />

      <AddContentModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          mutate();
          setAddOpen(false);
        }}
        ensureChannel={ensureChannel}
      />

      <DetailSheet open={sheetOpen} onOpenChange={setSheetOpen} title="작업 상세">
        <pre className="overflow-auto rounded bg-muted p-3 text-xs">
          {detailTask ? JSON.stringify(detailTask, null, 2) : ""}
        </pre>
      </DetailSheet>
    </div>
  );
}

function AddContentModal({
  open,
  onOpenChange,
  onSuccess,
  ensureChannel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  ensureChannel: (youtubeChannelId: string, name: string) => Promise<string>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [videoUrl, setVideoUrl] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<YouTubeVideoInfo | null>(null);
  const [targetViews, setTargetViews] = useState(1000);
  const [priority, setPriority] = useState(8);
  const [watchMinSec, setWatchMinSec] = useState(120);
  const [watchMaxSec, setWatchMaxSec] = useState(300);
  const [submitLoading, setSubmitLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || step !== 1) return;
    const vid = parseVideoId(videoUrl);
    if (!vid) {
      setVideoInfo(null);
      setFetchError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFetchLoading(true);
      setFetchError(null);
      try {
        const res = await fetch(`/api/youtube/videos?videoId=${encodeURIComponent(vid)}`);
        const data = await res.json();
        if (res.ok) {
          setVideoInfo({
            videoId: data.videoId ?? vid,
            title: data.title ?? "",
            thumbnail: data.thumbnail ?? "",
            duration: data.duration ?? "",
            channelTitle: data.channelTitle ?? "",
            channelId: data.channelId ?? "",
            publishedAt: data.publishedAt,
            viewCount: data.viewCount,
          });
        } else {
          setVideoInfo(null);
          setFetchError(data.error || "영상을 찾을 수 없습니다.");
        }
      } catch {
        setVideoInfo(null);
        setFetchError("영상 정보를 가져오는 중 오류가 발생했습니다.");
      } finally {
        setFetchLoading(false);
        debounceRef.current = null;
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, step, videoUrl]);

  const handleFetch = async () => {
    const vid = parseVideoId(videoUrl);
    if (!vid) {
      setFetchError("올바른 YouTube URL을 입력하세요.");
      return;
    }
    setFetchError(null);
    setFetchLoading(true);
    try {
      const res = await fetch(`/api/youtube/videos?videoId=${encodeURIComponent(vid)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "영상을 찾을 수 없습니다.");
      setVideoInfo({
        videoId: data.videoId ?? vid,
        title: data.title ?? "",
        thumbnail: data.thumbnail ?? "",
        duration: data.duration ?? "",
        channelTitle: data.channelTitle ?? "",
        channelId: data.channelId ?? "",
        publishedAt: data.publishedAt,
        viewCount: data.viewCount,
      });
      setStep(2);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "영상 정보를 가져오지 못했습니다.");
    } finally {
      setFetchLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!videoInfo) return;
    setSubmitLoading(true);
    try {
      const channelId = await ensureChannel(videoInfo.channelId, videoInfo.channelTitle);
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoInfo.videoId}`;

      const createRes = await apiClient.post(`/api/channels/${channelId}/videos`, {
        body: {
          title: videoInfo.title,
          youtube_url: youtubeUrl,
          channel_name: videoInfo.channelTitle,
          thumbnail_url: videoInfo.thumbnail,
          priority: "high",
          status: "active",
          source: "manual",
          target_views: targetViews,
          prob_like: 40,
          prob_comment: 10,
          watch_duration_sec: Math.round((watchMinSec + watchMaxSec) / 2),
          watch_duration_min_pct: (() => {
            const videoDurationSec = parseDurationToSeconds(videoInfo.duration);
            if (videoDurationSec <= 0) return 0;
            return Math.min(100, Math.round((watchMinSec / videoDurationSec) * 100));
          })(),
          watch_duration_max_pct: (() => {
            const videoDurationSec = parseDurationToSeconds(videoInfo.duration);
            if (videoDurationSec <= 0) return 0;
            return Math.min(100, Math.round((watchMaxSec / videoDurationSec) * 100));
          })(),
          prob_subscribe: 0,
        },
        silent: true,
      });

      if (!createRes.success) {
        const errMsg = (createRes.data as { error?: string })?.error ?? createRes.error ?? "";
        if (/duplicate|unique|already/i.test(errMsg)) {
          toast.error("이미 등록된 영상입니다. 작업/대기열에서 확인하세요.");
        } else {
          toast.error(errMsg || "영상 등록 실패");
        }
        setSubmitLoading(false);
        return;
      }

      const taskRes = await apiClient.post("/api/tasks", {
        body: {
          contentMode: "single",
          videoId: videoInfo.videoId,
          channelId,
          deviceCount: 20,
          source: "manual",
          priority,
          variables: {
            watchPercent: Math.min(100, Math.round((watchMaxSec / 60) * 100)),
            likeProb: 40,
            commentProb: 10,
            subscribeToggle: false,
          },
        },
        silent: true,
      });

      if (!taskRes.success) {
        toast.error(
          (taskRes.data as { error?: string })?.error ?? taskRes.error ?? "대기열 등록 실패"
        );
        setSubmitLoading(false);
        return;
      }

      toast.success("영상이 대기열에 등록되었습니다");
      onSuccess();
      setStep(1);
      setVideoUrl("");
      setVideoInfo(null);
      setTargetViews(1000);
      setPriority(8);
      setWatchMinSec(120);
      setWatchMaxSec(300);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep(1);
      setVideoUrl("");
      setVideoInfo(null);
      setFetchError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>콘텐츠 등록</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <>
            <Label>YouTube 영상 URL</Label>
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=... 또는 youtu.be/..."
            />
            {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}
            {fetchLoading && <p className="text-sm text-muted-foreground">영상 정보를 가져오는 중...</p>}
            {videoInfo && !fetchLoading && (
              <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
                {videoInfo.thumbnail && (
                  <img
                    src={videoInfo.thumbnail}
                    alt=""
                    className="h-20 w-28 shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{videoInfo.title}</div>
                  <div className="text-xs text-muted-foreground">{videoInfo.channelTitle}</div>
                  <div className="text-xs text-muted-foreground">{videoInfo.duration}</div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                취소
              </Button>
              {videoInfo ? (
                <Button onClick={() => setStep(2)}>다음: 설정</Button>
              ) : (
                <Button onClick={handleFetch} disabled={fetchLoading || !videoUrl.trim()}>
                  정보 불러오기
                </Button>
              )}
            </DialogFooter>
          </>
        )}
        {step === 2 && videoInfo && (
          <>
            <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt=""
                  className="h-16 w-24 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{videoInfo.title}</div>
                <div className="text-xs text-muted-foreground">{videoInfo.channelTitle}</div>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <Label>시청 목표 (회)</Label>
                <Input
                  type="number"
                  min={1}
                  value={targetViews}
                  onChange={(e) => setTargetViews(parseInt(e.target.value, 10) || 1000)}
                />
              </div>
              <div>
                <Label>우선순위 (1~10)</Label>
                <div className="flex items-center gap-2">
                  <Slider
                    value={[priority]}
                    onValueChange={([v]) => setPriority(v)}
                    min={1}
                    max={10}
                    step={1}
                  />
                  <span className="w-6 text-sm">{priority}</span>
                </div>
              </div>
              <div>
                <Label>시청 시간 (초) {watchMinSec} ~ {watchMaxSec}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={watchMinSec}
                    onChange={(e) => setWatchMinSec(parseInt(e.target.value, 10) || 0)}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={watchMaxSec}
                    onChange={(e) => setWatchMaxSec(parseInt(e.target.value, 10) || 300)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button onClick={handleSubmit} disabled={submitLoading}>
                {submitLoading ? "등록 중..." : "대기열에 등록"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
