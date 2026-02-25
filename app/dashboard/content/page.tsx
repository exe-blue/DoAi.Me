"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Upload,
  Plus,
  RefreshCw,
  Play,
  Eye,
  Heart,
  MessageSquare,
  Search,
  Target,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface TaskItem {
  id: string;
  title?: string;
  channelName?: string;
  videoId?: string;
  thumbnail?: string;
  status?: string;
  payload?: Record<string, unknown>;
  device_count?: number;
  created_at?: string;
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const ST: Record<string, { color: string; label: string }> = {
  active: { color: "bg-green-500", label: "활성" },
  paused: { color: "bg-amber-500", label: "일시정지" },
  completed: { color: "bg-blue-500", label: "완료" },
  queued: { color: "bg-slate-500", label: "대기" },
  running: { color: "bg-primary", label: "실행중" },
  pending: { color: "bg-slate-500", label: "대기" },
  failed: { color: "bg-red-500", label: "실패" },
  archived: { color: "bg-slate-600", label: "보관" },
};

const STATUS_TABS = [
  { key: "all", label: "전체" },
  { key: "running", label: "실행중" },
  { key: "queued", label: "대기" },
  { key: "completed", label: "완료" },
  { key: "failed", label: "실패" },
] as const;

export default function ContentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status") || "all";
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [targetViews, setTargetViews] = useState("100");
  const [watchDuration, setWatchDuration] = useState("60");
  const [probLike, setProbLike] = useState("15");
  const [probComment, setProbComment] = useState("5");
  const [addLoading, setAddLoading] = useState(false);

  const { data: tasksData, error, isLoading, mutate } = useSWR<{ tasks: TaskItem[] }>(
    "/api/tasks",
    fetcher,
    { refreshInterval: 30_000 }
  );

  const tasks = tasksData?.tasks ?? [];

  const filtered = useMemo(() => {
    let list = tasks;
    if (statusParam !== "all") {
      if (statusParam === "queued") {
        list = list.filter((t) => t.status === "pending" || t.status === "queued");
      } else {
        list = list.filter((t) => t.status === statusParam);
      }
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.id?.toLowerCase().includes(q) ||
          t.channelName?.toLowerCase().includes(q) ||
          (t.payload as { search_keyword?: string })?.search_keyword?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [tasks, statusParam, search]);

  const stats = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter((t) =>
        ["active", "pending", "queued", "running"].includes(t.status ?? "")
      ).length,
      completed: tasks.filter((t) => t.status === "completed").length,
    }),
    [tasks]
  );

  const extractVideoId = (url: string): string => {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be"))
        return u.pathname.slice(1).split("/")[0] ?? "";
      return u.searchParams.get("v") ?? url;
    } catch {
      return url;
    }
  };

  const handleAdd = async () => {
    const vid = extractVideoId(videoUrl);
    if (!vid) return;
    setAddLoading(true);
    const res = await apiClient.post("/api/tasks", {
      body: {
        videoId: vid,
        channelId: undefined,
        deviceCount: 20,
        variables: {
          watchPercent: parseInt(watchDuration, 10) || 80,
          likeProb: parseInt(probLike, 10) || 15,
          commentProb: parseInt(probComment, 10) || 5,
        },
      },
    });
    setAddLoading(false);
    if (res.success) {
      toast.success("태스크 등록됨");
      setAddOpen(false);
      setVideoUrl("");
      setVideoTitle("");
      mutate();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">콘텐츠</h1>
          <p className="text-sm text-slate-500">
            {stats.total}개 등록 · {stats.active} 활성 · {stats.completed} 완료
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          size="sm"
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> 영상 등록
        </Button>
      </div>

      {/* Status tabs — query param */}
      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] p-1">
        {STATUS_TABS.map((t) => {
          const isActive = statusParam === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() =>
                router.push(`/dashboard/content?status=${t.key}`)
              }
              className={cn(
                "flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                isActive ? "bg-[#1a1d2e] text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="제목, ID, 채널, 키워드 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-[#1e2130] bg-[#12141d] pl-9 text-sm text-slate-300"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button
            type="button"
            onClick={() => mutate()}
            className="underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 콘텐츠가 없습니다</p>
          <Button
            onClick={() => setAddOpen(true)}
            size="sm"
            className="mt-4 bg-primary hover:bg-primary/90"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 첫 영상 등록
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((v) => {
            const payload = (v.payload ?? {}) as Record<string, unknown>;
            const target = (payload.target_views as number) ?? 0;
            const done = (payload.completed_views as number) ?? 0;
            const pct =
              target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
            const st = ST[v.status ?? ""] ?? { color: "bg-blue-500", label: v.status ?? "—" };
            const title =
              v.title ?? (payload.title as string) ?? v.videoId ?? v.id?.slice(0, 8);

            return (
              <div
                key={v.id}
                className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4 transition-colors hover:border-[#2a2d40]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#1a1d2e]">
                    {v.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnail}
                        alt=""
                        className="h-16 w-24 rounded-lg object-cover"
                      />
                    ) : (
                      <Play className="h-6 w-6 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full", st.color)} />
                      <span className="truncate text-sm font-medium text-white">
                        {title}
                      </span>
                      <span className="rounded bg-[#1a1d2e] px-1.5 py-0.5 text-[9px] text-slate-500">
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-xs text-slate-500">
                      {v.channelName && <span>{v.channelName}</span>}
                      {(payload.watch_duration_sec ?? 60) && (
                        <span>
                          {Math.round(
                            ((payload.watch_duration_sec as number) ?? 60) / 60
                          )}
                          분
                        </span>
                      )}
                      <span className="flex items-center gap-0.5">
                        <Eye className="h-3 w-3" /> 목표 {target}
                      </span>
                      {(payload.prob_like ?? payload.likeProb) != null && (
                        <span className="flex items-center gap-0.5">
                          <Heart className="h-3 w-3" />{" "}
                          {(payload.prob_like ?? payload.likeProb) as number}%
                        </span>
                      )}
                      {(payload.prob_comment ?? payload.commentProb) != null && (
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-3 w-3" />{" "}
                          {(payload.prob_comment ?? payload.commentProb) as number}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-36 shrink-0 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono text-lg font-bold text-white">
                        {pct}%
                      </span>
                      {pct >= 100 && (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      )}
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-[#1e2130]">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all",
                          pct >= 100 ? "bg-green-600" : pct >= 50 ? "bg-primary" : "bg-amber-600"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">
                      {done} / {target}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">영상 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-slate-400">YouTube URL</Label>
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-400">제목 (선택)</Label>
              <Input
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="영상 제목"
                className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">목표 시청수</Label>
                <Input
                  type="number"
                  value={targetViews}
                  onChange={(e) => setTargetViews(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-slate-300"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">시청 시간 (초)</Label>
                <Input
                  type="number"
                  value={watchDuration}
                  onChange={(e) => setWatchDuration(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-slate-300"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-400">좋아요 확률 (%)</Label>
                <Input
                  type="number"
                  value={probLike}
                  onChange={(e) => setProbLike(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-slate-300"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-400">댓글 확률 (%)</Label>
                <Input
                  type="number"
                  value={probComment}
                  onChange={(e) => setProbComment(e.target.value)}
                  className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-slate-300"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              className="border-[#1e2130] text-slate-400"
            >
              취소
            </Button>
            <Button
              onClick={handleAdd}
              disabled={addLoading || !videoUrl.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {addLoading ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Target className="mr-1.5 h-3.5 w-3.5" />
              )}
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
