"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Upload,
  Plus,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Slider } from "@/components/ui/slider";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";
import type { Task } from "@/lib/types";

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

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

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  queued: { color: "bg-slate-500", label: "대기" },
  running: { color: "bg-primary", label: "진행중" },
  completed: { color: "bg-green-500", label: "완료" },
  error: { color: "bg-red-500", label: "실패" },
  stopped: { color: "bg-slate-600", label: "중지" },
};

const STATUS_TABS = [
  { key: "all", label: "전체" },
  { key: "queued", label: "대기" },
  { key: "running", label: "진행중" },
  { key: "completed", label: "완료" },
  { key: "failed", label: "실패" },
] as const;

type StatusTabKey = (typeof STATUS_TABS)[number]["key"];

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

export default function ContentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = (searchParams.get("status") as StatusTabKey) || "all";

  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editChannelId, setEditChannelId] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2>(1);
  const [videoUrl, setVideoUrl] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  const [targetViews, setTargetViews] = useState(1000);
  const [targetLikes, setTargetLikes] = useState(300);
  const [targetComments, setTargetComments] = useState(100);
  const [includeSubscribe, setIncludeSubscribe] = useState(false);
  const [watchMinSec, setWatchMinSec] = useState(120);
  const [watchMaxSec, setWatchMaxSec] = useState(300);
  const [priority, setPriority] = useState(8);
  const [commentPoolMode, setCommentPoolMode] = useState<"default" | "custom">("default");
  const [commentPoolText, setCommentPoolText] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);

  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkTargetViews, setBulkTargetViews] = useState(1000);
  const [bulkTargetLikes, setBulkTargetLikes] = useState(300);
  const [bulkTargetComments, setBulkTargetComments] = useState(100);
  const [bulkPriority, setBulkPriority] = useState(8);
  const [bulkLoading, setBulkLoading] = useState(false);

  const [editTargetViews, setEditTargetViews] = useState(0);
  const [editTargetLikes, setEditTargetLikes] = useState(0);
  const [editTargetComments, setEditTargetComments] = useState(0);
  const [editLoading, setEditLoading] = useState(false);
  const [editVideoInfo, setEditVideoInfo] = useState<YouTubeVideoInfo | null>(null);

  const { data: tasksData, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
    "/api/tasks",
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: channelsData } = useSWR<{ channels: { id: string; name: string }[] }>(
    "/api/channels",
    fetcher
  );
  const channels = channelsData?.channels ?? [];

  const tasks = tasksData?.tasks ?? [];

  // URL 입력 시 YouTube Data API로 자동 로딩 → 페이지 내 컴포넌트에 정보 표시
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!addOpen || step !== 1) return;
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
            videoId: data.videoId,
            title: data.title,
            thumbnail: data.thumbnail,
            duration: data.duration,
            channelTitle: data.channelTitle,
            channelId: data.channelId,
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
      }
      debounceRef.current = null;
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [addOpen, step, videoUrl]);

  // 로컬: cron 대신 1분마다 YouTube Data API 기반 동기화 호출
  useEffect(() => {
    const tick = () => {
      fetch("/api/sync-channels", { method: "POST", credentials: "include" }).catch(() => {});
    };
    const id = setInterval(tick, 60_000);
    tick();
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusParam === "failed") {
      list = list.filter((t) => t.status === "error");
    } else if (statusParam !== "all") {
      list = list.filter((t) => t.status === statusParam);
    }
    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [tasks, statusParam]);

  const ensureChannel = async (youtubeChannelId: string, name: string): Promise<string> => {
    const found = channels.find((c) => c.id === youtubeChannelId);
    if (found) return found.id;
    const res = await apiClient.post("/api/channels", {
      body: { name, youtube_channel_id: youtubeChannelId },
      silent: true,
    });
    if (!res.success || !res.data?.channel?.id) {
      throw new Error(res.error || "채널 생성 실패");
    }
    return (res.data as { channel: { id: string } }).channel.id;
  };

  const handleFetchVideo = async () => {
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
      if (!res.ok) {
        setFetchError(data.error || "영상을 찾을 수 없습니다.");
        return;
      }
      setVideoInfo({
        videoId: data.videoId,
        title: data.title,
        thumbnail: data.thumbnail,
        duration: data.duration,
        channelTitle: data.channelTitle,
        channelId: data.channelId,
        publishedAt: data.publishedAt,
        viewCount: data.viewCount,
      });
      setStep(2);
    } catch {
      setFetchError("영상 정보를 가져오는 중 오류가 발생했습니다.");
    } finally {
      setFetchLoading(false);
    }
  };

  const handleAddSubmit = async () => {
    if (!videoInfo) return;
    const alreadyCompleted = tasks.find(
      (t) => t.videoId === videoInfo.videoId && (t.status === "completed" || t.status === "done")
    );
    if (alreadyCompleted && !window.confirm("이미 완료된 영상입니다. 다시 실행하시겠습니까?")) {
      return;
    }
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
          prob_like: targetLikes > 0 ? 100 : 0,
          prob_comment: targetComments > 0 ? 100 : 0,
          watch_duration_sec: Math.round((watchMinSec + watchMaxSec) / 2),
          watch_duration_min_pct: Math.round((watchMinSec / 60) * 100),
          watch_duration_max_pct: Math.round((watchMaxSec / 60) * 100),
          prob_subscribe: includeSubscribe ? 100 : 0,
        },
        silent: true,
      });

      if (!createRes.success) {
        const errMsg = (createRes.data as { error?: string })?.error ?? createRes.error ?? "";
        if (errMsg.includes("duplicate") || errMsg.includes("unique") || errMsg.includes("already")) {
          const confirmEdit = window.confirm(
            "이미 등록된 영상입니다. 목표를 수정하시겠습니까?"
          );
          if (confirmEdit) {
            setEditChannelId(channelId);
            setEditTask({
              ...videoInfo,
              id: "",
              videoId: videoInfo.videoId,
              channelName: videoInfo.channelTitle,
              status: "queued",
              priority: 8,
              isPriority: false,
              assignedDevices: 0,
              totalDevices: 0,
              progress: 0,
              variables: {} as Task["variables"],
              createdAt: "",
              completedAt: null,
              logs: [],
              targetViews: targetViews,
              completedViews: 0,
              probLike: targetLikes,
              probComment: targetComments,
            } as Task);
            setEditTargetViews(targetViews);
            setEditTargetLikes(targetLikes);
            setEditTargetComments(targetComments);
            setAddOpen(false);
            setEditOpen(true);
          }
        } else {
          toast.error(errMsg || "영상 등록 실패");
        }
        setSubmitLoading(false);
        return;
      }

      const video = (createRes.data as { video?: { id: string } })?.video;
      const videoId = video?.id ?? videoInfo.videoId;

      const taskRes = await apiClient.post("/api/tasks", {
        body: {
          contentMode: "single",
          videoId,
          channelId,
          deviceCount: 20,
          source: "manual",
          priority,
          variables: {
            watchPercent: Math.min(100, Math.round((watchMaxSec / 60) * 100)),
            likeProb: targetLikes > 0 ? 40 : 0,
            commentProb: targetComments > 0 ? 10 : 0,
            subscribeToggle: includeSubscribe,
          },
        },
        silent: true,
      });

      if (!taskRes.success) {
        toast.error((taskRes.data as { error?: string })?.error ?? taskRes.error ?? "대기열 등록 실패");
        setSubmitLoading(false);
        return;
      }

      toast.success("영상이 대기열에 등록되었습니다");
      setAddOpen(false);
      resetAddForm();
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setSubmitLoading(false);
    }
  };

  const resetAddForm = () => {
    setStep(1);
    setVideoUrl("");
    setVideoInfo(null);
    setFetchError(null);
    setTargetViews(1000);
    setTargetLikes(300);
    setTargetComments(100);
    setIncludeSubscribe(false);
    setWatchMinSec(120);
    setWatchMaxSec(300);
    setPriority(8);
    setCommentPoolMode("default");
    setCommentPoolText("");
  };

  const handleBulkSubmit = async () => {
    const lines = bulkUrls
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const urls = [...new Set(lines)];
    if (urls.length === 0) {
      toast.error("URL을 한 줄에 하나씩 입력하세요.");
      return;
    }
    setBulkLoading(true);
    let registered = 0;
    let duplicate = 0;
    let failed = 0;
    try {
      for (const url of urls) {
        const vid = parseVideoId(url);
        if (!vid) {
          failed++;
          continue;
        }
        let info: YouTubeVideoInfo;
        try {
          const res = await fetch(`/api/youtube/videos?videoId=${encodeURIComponent(vid)}`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "fetch failed");
          info = {
            videoId: data.videoId,
            title: data.title,
            thumbnail: data.thumbnail,
            duration: data.duration,
            channelTitle: data.channelTitle,
            channelId: data.channelId,
          };
        } catch {
          failed++;
          continue;
        }
        try {
          const channelId = await ensureChannel(info.channelId, info.channelTitle);
          const createRes = await apiClient.post(`/api/channels/${channelId}/videos`, {
            body: {
              title: info.title,
              youtube_url: `https://www.youtube.com/watch?v=${info.videoId}`,
              channel_name: info.channelTitle,
              priority: "high",
              status: "active",
              target_views: bulkTargetViews,
              prob_like: bulkTargetLikes > 0 ? 100 : 0,
              prob_comment: bulkTargetComments > 0 ? 100 : 0,
            },
            silent: true,
          });
          if (!createRes.success) {
            duplicate++;
            continue;
          }
          const video = (createRes.data as { video?: { id: string } })?.video;
          const taskRes = await apiClient.post("/api/tasks", {
            body: {
              contentMode: "single",
              videoId: video?.id ?? info.videoId,
              channelId,
              deviceCount: 20,
              source: "manual",
              priority: bulkPriority,
              variables: {
                watchPercent: 80,
                likeProb: bulkTargetLikes > 0 ? 40 : 0,
                commentProb: bulkTargetComments > 0 ? 10 : 0,
              },
            },
            silent: true,
          });
          if (taskRes.success) registered++;
          else duplicate++;
        } catch {
          failed++;
        }
      }
      toast.success(`${registered}개 등록, ${duplicate}개 중복, ${failed}개 실패`);
      setBulkOpen(false);
      setBulkUrls("");
      mutate();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editTask?.videoId) return;
    const channelId =
      editChannelId ?? channels.find((c) => c.name === editTask.channelName)?.id;
    if (!channelId) {
      toast.error("채널을 찾을 수 없습니다.");
      return;
    }
    setEditLoading(true);
    try {
      const res = await apiClient.put(
        `/api/channels/${channelId}/videos/${editTask.videoId}`,
        {
          body: {
            target_views: editTargetViews,
            prob_like: editTargetLikes > 0 ? 100 : 0,
            prob_comment: editTargetComments > 0 ? 100 : 0,
          },
          silent: true,
        }
      );
      if (res.success) {
        toast.success("목표가 수정되었습니다.");
        setEditOpen(false);
        setEditTask(null);
        mutate();
      } else {
        toast.error((res.data as { error?: string })?.error ?? res.error ?? "수정 실패");
      }
    } finally {
      setEditLoading(false);
    }
  };

  const handleDelete = async (task: Task) => {
    if (!window.confirm("이 영상을 목록에서 삭제하시겠습니까?")) return;
    const channelId = channels.find((c) => c.name === task.channelName)?.id;
    if (channelId && task.videoId) {
      await apiClient.delete(
        `/api/channels/${channelId}/videos?ids=${encodeURIComponent(task.videoId)}`,
        { silent: true }
      );
    }
    await apiClient.delete("/api/tasks", { body: { id: task.id }, silent: true });
    toast.success("삭제되었습니다.");
    mutate();
  };

  const handleRetry = async (taskId: string) => {
    const res = await apiClient.post(`/api/tasks/${taskId}/retry`, { body: {} }, { silent: true });
    if (res.success) {
      toast.success("재시도가 등록되었습니다.");
      mutate();
    } else {
      toast.error((res.data as { error?: string })?.error ?? res.error ?? "재시도 실패");
    }
  };

  const openEdit = (task: Task) => {
    setEditChannelId(null);
    setEditTask(task);
    setEditTargetViews(task.targetViews ?? 0);
    setEditTargetLikes(task.probLike ?? 0);
    setEditTargetComments(task.probComment ?? 0);
    setEditVideoInfo(null);
    setEditOpen(true);
  };

  // 수정 모달 열릴 때 YouTube Data API로 해당 영상 정보 로딩
  useEffect(() => {
    if (!editOpen || !editTask?.videoId) {
      setEditVideoInfo(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/youtube/videos?videoId=${encodeURIComponent(editTask.videoId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.videoId) return;
        setEditVideoInfo({
          videoId: data.videoId,
          title: data.title,
          thumbnail: data.thumbnail,
          duration: data.duration,
          channelTitle: data.channelTitle,
          channelId: data.channelId,
          publishedAt: data.publishedAt,
          viewCount: data.viewCount,
        });
      })
      .catch(() => setEditVideoInfo(null));
    return () => {
      cancelled = true;
    };
  }, [editOpen, editTask?.videoId]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">콘텐츠 등록</h1>
          <p className="text-sm text-[#64748b]">
            직접 등록한 영상은 채널 자동 등록보다 항상 우선 실행됩니다
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-[#1e2130] text-slate-400 hover:bg-[#1a1d2e]"
            onClick={() => setBulkOpen(true)}
          >
            벌크 등록
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 영상 등록
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] p-1">
        {STATUS_TABS.map((t) => {
          const isActive = statusParam === t.key;
          const tabKey = t.key === "failed" ? "failed" : t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => router.push(`/dashboard/content?status=${tabKey}`)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-[#1a1d2e] text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button type="button" onClick={() => mutate()} className="underline hover:no-underline">
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 콘텐츠가 없습니다</p>
          <Button
            size="sm"
            className="mt-4 bg-primary hover:bg-primary/90"
            onClick={() => {
              resetAddForm();
              setAddOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 첫 영상 등록
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-[#1e2130] hover:bg-transparent">
                <TableHead className="w-[80px] text-slate-500">썸네일</TableHead>
                <TableHead className="text-slate-500">제목</TableHead>
                <TableHead className="text-slate-500">채널</TableHead>
                <TableHead className="text-slate-500">시청 목표</TableHead>
                <TableHead className="text-slate-500">좋아요</TableHead>
                <TableHead className="text-slate-500">댓글</TableHead>
                <TableHead className="text-slate-500">진행률</TableHead>
                <TableHead className="text-slate-500">상태</TableHead>
                <TableHead className="text-slate-500">등록일</TableHead>
                <TableHead className="w-[60px] text-slate-500">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const st = STATUS_MAP[t.status] ?? { color: "bg-slate-500", label: t.status };
                const targetV = t.targetViews ?? 0;
                const doneV = t.completedViews ?? 0;
                const viewStr = targetV > 0 ? `${doneV}/${targetV}` : "—";
                const likeStr = (t.probLike ?? 0) > 0 ? `${t.probLike}` : "—";
                const commentStr = (t.probComment ?? 0) > 0 ? `${t.probComment}` : "—";
                return (
                  <TableRow key={t.id} className="border-[#1e2130] hover:bg-[#1a1d2e]/50">
                    <TableCell className="p-2">
                      <div className="h-[27px] w-[48px] overflow-hidden rounded bg-[#1a1d2e]">
                        {t.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={t.thumbnail}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-white">
                      {t.title || t.videoId || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">@{t.channelName || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{viewStr}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{likeStr}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">{commentStr}</TableCell>
                    <TableCell className="w-[100px]">
                      <div className="flex items-center gap-2">
                        <Progress value={t.progress} className="h-2 flex-1" />
                        <span className="text-xs font-medium text-slate-300">{t.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {t.source === "manual" && (
                          <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                            직접
                          </span>
                        )}
                        {t.source === "channel_auto" && (
                          <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[9px] font-medium text-green-400">
                            자동
                          </span>
                        )}
                        <span
                          className={cn(
                            "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                            st.color,
                            "text-white"
                          )}
                        >
                          {st.label}
                        </span>
                        {t.priority != null && (
                          <span className="font-mono text-[9px] text-slate-500">P{t.priority}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(t.createdAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-white"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-[#1e2130] bg-[#12141d]">
                          <DropdownMenuItem
                            className="text-slate-300 focus:bg-[#1a1d2e] focus:text-white"
                            onClick={() => openEdit(t)}
                          >
                            <Pencil className="mr-2 h-3.5 w-3.5" /> 수정
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-400 focus:bg-red-950/30 focus:text-red-300"
                            onClick={() => handleDelete(t)}
                          >
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> 삭제
                          </DropdownMenuItem>
                          {t.status === "error" && (
                            <DropdownMenuItem
                              className="text-slate-300 focus:bg-[#1a1d2e] focus:text-white"
                              onClick={() => handleRetry(t.id)}
                            >
                              <RotateCcw className="mr-2 h-3.5 w-3.5" /> 재시도
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add video modal */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAddForm();
        }}
      >
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">영상 등록</DialogTitle>
          </DialogHeader>
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-slate-400">YouTube 영상 URL을 입력하세요</Label>
                <Input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=xxxxxxx"
                  className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  주소 입력 시 YouTube Data API로 자동 로딩됩니다
                </p>
              </div>
              {fetchLoading && (
                <p className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  영상 정보를 가져오는 중...
                </p>
              )}
              {fetchError && (
                <p className="text-sm text-red-400">{fetchError}</p>
              )}
              {videoInfo && !fetchLoading && (
                <div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-3">
                  <div className="flex gap-3">
                    <div className="h-16 w-28 shrink-0 overflow-hidden rounded bg-[#0f1117]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={videoInfo.thumbnail} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{videoInfo.title}</p>
                      <p className="text-xs text-slate-500">
                        @{videoInfo.channelTitle} · {videoInfo.duration}
                        {videoInfo.viewCount
                          ? ` · ${parseInt(videoInfo.viewCount, 10).toLocaleString()}회`
                          : ""}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {videoInfo ? (
                  <Button
                    onClick={() => setStep(2)}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    다음: 목표 설정
                  </Button>
                ) : (
                  <Button
                    onClick={handleFetchVideo}
                    disabled={fetchLoading || !videoUrl.trim()}
                    className="flex-1 bg-primary hover:bg-primary/90"
                  >
                    정보 불러오기
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {videoInfo && (
                <>
                  <div className="aspect-video w-full overflow-hidden rounded-lg bg-[#1a1d2e]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={videoInfo.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-sm font-medium text-white">{videoInfo.title}</p>
                  <p className="text-xs text-slate-500">
                    채널: @{videoInfo.channelTitle} | 업로드:{" "}
                    {videoInfo.publishedAt
                      ? new Date(videoInfo.publishedAt).toLocaleDateString("ko-KR")
                      : "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    길이: {videoInfo.duration} | 조회수:{" "}
                    {videoInfo.viewCount ? parseInt(videoInfo.viewCount, 10).toLocaleString() : "—"}
                  </p>
                </>
              )}
              <div className="border-t border-[#1e2130] pt-4">
                <Label className="text-xs text-slate-400">목표 설정</Label>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-slate-500">시청 수</Label>
                    <Input
                      type="number"
                      value={targetViews}
                      onChange={(e) => setTargetViews(parseInt(e.target.value, 10) || 0)}
                      className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">좋아요</Label>
                    <Input
                      type="number"
                      value={targetLikes}
                      onChange={(e) => setTargetLikes(parseInt(e.target.value, 10) || 0)}
                      className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">댓글</Label>
                    <Input
                      type="number"
                      value={targetComments}
                      onChange={(e) => setTargetComments(parseInt(e.target.value, 10) || 0)}
                      className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="subscribe"
                    checked={includeSubscribe}
                    onChange={(e) => setIncludeSubscribe(e.target.checked)}
                    className="rounded border-[#1e2130] bg-[#12141d]"
                  />
                  <Label htmlFor="subscribe" className="text-xs text-slate-400">
                    구독 액션 포함
                  </Label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-slate-500">시청 시간 최소 (초)</Label>
                    <Input
                      type="number"
                      value={watchMinSec}
                      onChange={(e) => setWatchMinSec(parseInt(e.target.value, 10) || 0)}
                      className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500">시청 시간 최대 (초)</Label>
                    <Input
                      type="number"
                      value={watchMaxSec}
                      onChange={(e) => setWatchMaxSec(parseInt(e.target.value, 10) || 0)}
                      className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Label className="text-[10px] text-slate-500">우선순위 (1~10, 직접 등록 기본 8)</Label>
                  <Slider
                    value={[priority]}
                    onValueChange={([v]) => setPriority(v)}
                    min={1}
                    max={10}
                    step={1}
                    className="mt-1"
                  />
                  <span className="text-xs text-slate-500">{priority} / 10</span>
                </div>
                <div className="mt-3">
                  <Label className="text-xs text-slate-400">댓글 풀</Label>
                  <div className="mt-1 flex gap-4">
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <input
                        type="radio"
                        name="commentPool"
                        checked={commentPoolMode === "default"}
                        onChange={() => setCommentPoolMode("default")}
                        className="rounded border-[#1e2130]"
                      />
                      기본 댓글 풀 사용
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      <input
                        type="radio"
                        name="commentPool"
                        checked={commentPoolMode === "custom"}
                        onChange={() => setCommentPoolMode("custom")}
                        className="rounded border-[#1e2130]"
                      />
                      직접 입력
                    </label>
                  </div>
                  {commentPoolMode === "custom" && (
                    <textarea
                      value={commentPoolText}
                      onChange={(e) => setCommentPoolText(e.target.value)}
                      placeholder="한 줄에 하나씩"
                      rows={3}
                      className="mt-1 w-full rounded border border-[#1e2130] bg-[#12141d] p-2 text-xs text-slate-300"
                    />
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2 border-t border-[#1e2130] pt-4">
                <Button
                  variant="outline"
                  className="border-[#1e2130] text-slate-400"
                  onClick={() => setStep(1)}
                >
                  뒤로
                </Button>
                <Button
                  variant="outline"
                  className="border-[#1e2130] text-slate-400"
                  onClick={() => setAddOpen(false)}
                >
                  취소
                </Button>
                <Button
                  onClick={handleAddSubmit}
                  disabled={submitLoading}
                  className="bg-primary hover:bg-primary/90"
                >
                  {submitLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  대기열에 등록
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk modal */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">벌크 영상 등록</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">한 줄에 하나씩 YouTube URL을 입력하세요</p>
          <textarea
            value={bulkUrls}
            onChange={(e) => setBulkUrls(e.target.value)}
            placeholder="https://youtube.com/watch?v=aaa&#10;https://youtu.be/bbb"
            rows={6}
            className="w-full rounded border border-[#1e2130] bg-[#12141d] p-2 font-mono text-sm text-slate-300"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] text-slate-500">시청</Label>
              <Input
                type="number"
                value={bulkTargetViews}
                onChange={(e) => setBulkTargetViews(parseInt(e.target.value, 10) || 0)}
                className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">좋아요</Label>
              <Input
                type="number"
                value={bulkTargetLikes}
                onChange={(e) => setBulkTargetLikes(parseInt(e.target.value, 10) || 0)}
                className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">댓글</Label>
              <Input
                type="number"
                value={bulkTargetComments}
                onChange={(e) => setBulkTargetComments(parseInt(e.target.value, 10) || 0)}
                className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] text-slate-500">우선순위</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={bulkPriority}
                onChange={(e) => setBulkPriority(Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 8)))}
                className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter className="border-t border-[#1e2130] pt-4">
            <Button
              variant="outline"
              className="border-[#1e2130] text-slate-400"
              onClick={() => setBulkOpen(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleBulkSubmit}
              disabled={bulkLoading}
              className="bg-primary hover:bg-primary/90"
            >
              {bulkLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditTask(null);
            setEditChannelId(null);
          }
        }}
      >
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">목표 수정</DialogTitle>
          </DialogHeader>
          {editTask && (
            <div className="space-y-4">
              {editVideoInfo ? (
                <div className="flex gap-3 rounded-lg border border-[#1e2130] bg-[#12141d] p-2">
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded bg-[#0f1117]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={editVideoInfo.thumbnail} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{editVideoInfo.title}</p>
                    <p className="text-xs text-slate-500">@{editVideoInfo.channelTitle}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">{editTask.title || editTask.videoId}</p>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-500">시청 목표</Label>
                  <Input
                    type="number"
                    value={editTargetViews}
                    onChange={(e) => setEditTargetViews(parseInt(e.target.value, 10) || 0)}
                    className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">좋아요</Label>
                  <Input
                    type="number"
                    value={editTargetLikes}
                    onChange={(e) => setEditTargetLikes(parseInt(e.target.value, 10) || 0)}
                    className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">댓글</Label>
                  <Input
                    type="number"
                    value={editTargetComments}
                    onChange={(e) => setEditTargetComments(parseInt(e.target.value, 10) || 0)}
                    className="mt-0.5 border-[#1e2130] bg-[#12141d] font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="border-t border-[#1e2130] pt-4">
            <Button
              variant="outline"
              className="border-[#1e2130] text-slate-400"
              onClick={() => setEditOpen(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editLoading || !editTask}
              className="bg-primary hover:bg-primary/90"
            >
              {editLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
