"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Tv,
  Plus,
  RefreshCw,
  Video,
  Users,
  Pause,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Channel {
  id: string;
  name: string;
  youtubeHandle?: string | null;
  handle?: string | null;
  thumbnail?: string | null;
  thumbnail_url?: string | null;
  subscriberCount?: string;
  subscriber_count?: string | null;
  videoCount?: number;
  video_count?: number;
  addedAt?: string;
  autoSync?: boolean;
  is_monitored?: boolean;
  last_collected_at?: string | null;
  status?: string | null;
  auto_collect?: boolean;
}

interface ChannelVideo {
  id: string;
  title: string;
  status?: string;
  thumbnail?: string;
  taskId?: string | null;
  source?: "manual" | "channel_auto" | null;
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function timeSince(d: string | null | undefined): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

function fmtSubs(s: string | number | null | undefined): string {
  if (s == null) return "—";
  const n = typeof s === "string" ? parseInt(s, 10) : s;
  if (Number.isNaN(n)) return String(s);
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}천`;
  return String(n);
}

/** Parse channel handle or ID from URL/input */
function parseChannelInput(input: string): { handle?: string; channelId?: string } {
  const t = input.trim();
  if (!t) return {};
  if (/^@[\w-]+$/i.test(t)) return { handle: t };
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    if (u.hostname.includes("youtube.com")) {
      const handleMatch = u.pathname.match(/\/@([\w-]+)/);
      if (handleMatch) return { handle: `@${handleMatch[1]}` };
      const channelMatch = u.pathname.match(/\/channel\/(UC[\w-]+)/);
      if (channelMatch) return { channelId: channelMatch[1] };
    }
  } catch {
    if (/^@[\w-]+$/i.test(t)) return { handle: t };
  }
  return {};
}

const CHANNELS_KEY = "/api/channels";
const TABS = [
  { key: "all", label: "전체" },
  { key: "monitored", label: "모니터링 중" },
  { key: "paused", label: "일시정지" },
] as const;

export default function ChannelsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<{ channels: Channel[] }>(
    CHANNELS_KEY,
    fetcher,
    { refreshInterval: 60_000 }
  );

  const channels = data?.channels ?? [];
  const filtered = useMemo(() => {
    if (tab === "monitored") return channels.filter((c) => c.is_monitored);
    if (tab === "paused") return channels.filter((c) => !c.is_monitored);
    return channels;
  }, [channels, tab]);

  const handleSync = async () => {
    const res = await apiClient.get("/api/youtube/sync");
    if (res.success !== false) {
      toast.success("동기화 요청됨");
      mutate();
    }
  };

  const handlePause = async (id: string, isMonitored: boolean) => {
    const res = await apiClient.put(`/api/channels/${id}`, {
      body: { is_monitored: !isMonitored },
    });
    if (res.success) {
      toast.success(isMonitored ? "일시정지됨" : "모니터링 재개");
      mutate();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 채널을 삭제할까요?")) return;
    const res = await apiClient.delete(`/api/channels/${id}`);
    if (res.success) {
      toast.success("채널 삭제됨");
      setSelectedId(null);
      mutate();
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + Actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">채널 관리</h1>
        <Button
          onClick={() => setAddOpen(true)}
          size="sm"
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> 채널 추가
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center rounded-md px-4 py-2 text-xs font-medium transition-colors",
              tab === t.key ? "bg-[#1a1d2e] text-white" : "text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
          </button>
        ))}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Tv className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">
            {tab === "all" ? "등록된 채널이 없습니다" : "해당하는 채널이 없습니다"}
          </p>
          {tab === "all" && (
            <Button
              onClick={() => setAddOpen(true)}
              size="sm"
              className="mt-4 bg-primary hover:bg-primary/90"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> 첫 채널 추가
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              onSync={handleSync}
              onPause={() => handlePause(ch.id, !!ch.is_monitored)}
              onDelete={() => handleDelete(ch.id)}
              onOpenDetail={() => setSelectedId(ch.id)}
            />
          ))}
        </div>
      )}

      <AddChannelModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          mutate();
          setAddOpen(false);
        }}
        onOpenBulk={() => {
          setAddOpen(false);
          setBulkOpen(true);
        }}
      />

      <BulkRegisterModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSuccess={() => {
          mutate();
          setBulkOpen(false);
        }}
      />

      {selectedId && (
        <ChannelDetailSheet
          channelId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdate={() => mutate()}
          onDelete={() => handleDelete(selectedId)}
        />
      )}
    </div>
  );
}

function ChannelCard({
  channel,
  onSync,
  onPause,
  onDelete,
  onOpenDetail,
}: {
  channel: Channel;
  onSync: () => void;
  onPause: () => void;
  onDelete: () => void;
  onOpenDetail: () => void;
}) {
  const handle = channel.handle ?? channel.youtubeHandle ?? "";
  const subs = channel.subscriber_count ?? channel.subscriberCount ?? "";
  const videoCount = channel.video_count ?? channel.videoCount ?? 0;
  const thumb = channel.thumbnail ?? channel.thumbnail_url;
  const monitored = channel.is_monitored ?? channel.autoSync;
  const lastSync = channel.last_collected_at;

  const statusDot = monitored ? (
    <span className="text-[10px] text-green-400">● 모니터링 중</span>
  ) : channel.status === "paused" ? (
    <span className="text-[10px] text-amber-400">◐ 일시정지</span>
  ) : (
    <span className="text-[10px] text-slate-500">○ 비활성</span>
  );

  return (
    <div
      className="cursor-pointer rounded-xl border border-[#1e2130] bg-[#12141d] p-5 transition-colors hover:border-[#2a2d40]"
      onClick={onOpenDetail}
    >
      <div className="flex gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[#1a1d2e]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="h-14 w-14 object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center">
              <Tv className="h-6 w-6 text-slate-500" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-white text-[18px] leading-tight">
            {channel.name}
          </div>
          <div className="mt-0.5 text-sm text-slate-400">{handle || `채널 ID: ${channel.id.slice(0, 8)}`}</div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          구독자 {fmtSubs(subs)}
        </span>
        <span className="flex items-center gap-1">
          <Video className="h-3.5 w-3.5" />
          영상 {videoCount}개
        </span>
        <span>등록 영상 {videoCount}개</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-600">
        마지막 동기화: {timeSince(lastSync)}
      </div>
      <div className="mt-2 flex items-center gap-1">{statusDot}</div>
      <div
        className="mt-4 flex gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-[#1e2130] bg-[#0d1117] text-xs text-slate-400 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onSync();
          }}
        >
          <RefreshCw className="mr-1 h-3 w-3" /> 동기화
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-[#1e2130] bg-[#0d1117] text-xs text-slate-400 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            onPause();
          }}
        >
          <Pause className="mr-1 h-3 w-3" /> 일시정지
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-[#1e2130] bg-[#0d1117] text-xs text-red-400 hover:bg-red-900/10"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="mr-1 h-3 w-3" /> 삭제
        </Button>
      </div>
    </div>
  );
}

function AddChannelModal({
  open,
  onOpenChange,
  onSuccess,
  onOpenBulk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onOpenBulk: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [url, setUrl] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [channelInfo, setChannelInfo] = useState<{
    id: string;
    name: string;
    handle: string;
    thumbnail?: string;
    subscriberCount?: string | number;
    videoCount?: number;
  } | null>(null);
  const [autoQueue, setAutoQueue] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [targetViews, setTargetViews] = useState("500");
  const [targetLikes, setTargetLikes] = useState("100");
  const [targetComments, setTargetComments] = useState("30");
  const [priority, setPriority] = useState("5");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 주소 입력 시 YouTube Data API로 자동 로딩 → 컴포넌트에 채널 정보 표시
  useEffect(() => {
    if (!open) return;
    const { handle } = parseChannelInput(url);
    if (!handle) {
      setChannelInfo(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFetchLoading(true);
      try {
        const res = await fetch(`/api/youtube/channels?handles=${encodeURIComponent(handle)}`);
        const data = await res.json();
        if (res.ok) {
          const list = Array.isArray(data) ? data : data?.results ?? [];
          const first = list[0];
          if (first && !first.error && first.id) {
            setChannelInfo({
              id: first.id,
              name: first.title ?? first.name ?? first.id,
              handle: first.handle ?? (first.id?.startsWith("UC") ? undefined : `@${first.id}`),
              thumbnail: first.thumbnail,
              subscriberCount: first.subscriberCount ?? first.subscriber_count,
              videoCount: first.videoCount ?? first.video_count,
            });
          } else {
            setChannelInfo(null);
          }
        } else {
          setChannelInfo(null);
        }
      } catch {
        setChannelInfo(null);
      } finally {
        setFetchLoading(false);
        debounceRef.current = null;
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, url]);

  const handleFetch = async () => {
    const { handle } = parseChannelInput(url);
    if (!handle) {
      toast.error("@핸들 또는 youtube.com/@핸들 형식으로 입력하세요");
      return;
    }
    setFetchLoading(true);
    setChannelInfo(null);
    try {
      const res = await fetch(`/api/youtube/channels?handles=${encodeURIComponent(handle)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "정보를 가져오지 못했습니다");
      const list = Array.isArray(data) ? data : data?.results ?? [];
      const first = list[0];
      if (first?.error) throw new Error(first.error);
      if (!first?.id) throw new Error("채널 정보가 없습니다");
      setChannelInfo({
        id: first.id,
        name: first.title ?? first.name ?? first.id,
        handle: first.handle ?? (first.id?.startsWith("UC") ? undefined : `@${first.id}`),
        thumbnail: first.thumbnail,
        subscriberCount: first.subscriberCount ?? first.subscriber_count,
        videoCount: first.videoCount ?? first.video_count,
      });
      setStep(2);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "채널 정보를 가져오지 못했습니다");
    } finally {
      setFetchLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!channelInfo) return;
    const registerUrl = channelInfo.handle
      ? `https://www.youtube.com/${channelInfo.handle}`
      : `https://www.youtube.com/channel/${channelInfo.id}`;
    setRegisterLoading(true);
    try {
      const res = await apiClient.post("/api/youtube/channels", {
        body: { url: registerUrl },
      });
      setRegisterLoading(false);
      if (res.success) {
        toast.success("채널이 등록되었습니다");
        onSuccess();
        setStep(1);
        setUrl("");
        setChannelInfo(null);
      }
    } catch {
      setRegisterLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep(1);
      setUrl("");
      setChannelInfo(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">채널 추가</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <>
            <p className="text-xs text-slate-500">
              YouTube 채널 URL 또는 핸들을 입력하세요
            </p>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@channelname 또는 @handle"
              className="border-[#1e2130] bg-[#12141d] text-sm text-slate-300"
            />
            <p className="text-[11px] text-slate-600">
              주소 입력 시 YouTube Data API로 자동 로딩됩니다 · @handle, youtube.com/@handle
            </p>
            {fetchLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <RefreshCw className="h-4 w-4 animate-spin" />
                채널 정보를 가져오는 중...
              </p>
            )}
            {channelInfo && !fetchLoading && (
              <div className="flex gap-3 rounded-lg border border-[#1e2130] bg-[#12141d] p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#1a1d2e]">
                  {channelInfo.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={channelInfo.thumbnail} alt="" className="h-12 w-12 object-cover" />
                  ) : (
                    <Tv className="m-2 h-8 w-8 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-white">{channelInfo.name}</div>
                  <div className="text-xs text-slate-400">{channelInfo.handle}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    구독자 {fmtSubs(channelInfo.subscriberCount)} · 영상 {channelInfo.videoCount ?? 0}개
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {channelInfo ? (
                <Button
                  onClick={() => setStep(2)}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  다음: 등록 옵션
                </Button>
              ) : (
                <Button
                  onClick={handleFetch}
                  disabled={fetchLoading || !url.trim()}
                  className="flex-1 bg-primary hover:bg-primary/90"
                >
                  정보 불러오기
                </Button>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 underline hover:text-slate-300"
              onClick={onOpenBulk}
            >
              여러 채널 한번에 등록
            </button>
          </>
        )}

        {step === 2 && channelInfo && (
          <>
            <div className="flex gap-3 rounded-lg border border-[#1e2130] bg-[#12141d] p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#1a1d2e]">
                {channelInfo.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={channelInfo.thumbnail} alt="" className="h-12 w-12 object-cover" />
                ) : (
                  <Tv className="m-2 h-8 w-8 text-slate-500" />
                )}
              </div>
              <div>
                <div className="font-medium text-white">{channelInfo.name}</div>
                <div className="text-xs text-slate-400">{channelInfo.handle}</div>
                <div className="mt-1 text-xs text-slate-500">
                  구독자 {fmtSubs(channelInfo.subscriberCount)} · 영상 {channelInfo.videoCount ?? 0}개
                </div>
              </div>
            </div>
            <div className="space-y-3 border-t border-[#1e2130] pt-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="autoQueue"
                  checked={autoQueue}
                  onCheckedChange={(v) => setAutoQueue(!!v)}
                />
                <Label htmlFor="autoQueue" className="text-sm text-slate-300">
                  새 영상 자동 대기열 등록
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="autoSync"
                  checked={autoSync}
                  onCheckedChange={(v) => setAutoSync(!!v)}
                />
                <Label htmlFor="autoSync" className="text-sm text-slate-300">
                  1분마다 자동 동기화
                </Label>
              </div>
            </div>
            <div className="space-y-2 border-t border-[#1e2130] pt-3">
              <p className="text-xs font-medium text-slate-400">자동 등록 시 기본 설정</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-slate-500">시청 목표</Label>
                  <Input
                    type="number"
                    value={targetViews}
                    onChange={(e) => setTargetViews(e.target.value)}
                    className="mt-0.5 h-8 border-[#1e2130] bg-[#12141d] font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">좋아요 목표</Label>
                  <Input
                    type="number"
                    value={targetLikes}
                    onChange={(e) => setTargetLikes(e.target.value)}
                    className="mt-0.5 h-8 border-[#1e2130] bg-[#12141d] font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">댓글 목표</Label>
                  <Input
                    type="number"
                    value={targetComments}
                    onChange={(e) => setTargetComments(e.target.value)}
                    className="mt-0.5 h-8 border-[#1e2130] bg-[#12141d] font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500">우선순위 (1~10)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="mt-0.5 h-8 border-[#1e2130] bg-[#12141d] font-mono text-xs"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-slate-600">
              ※ 직접 등록(콘텐츠 등록)된 영상이 항상 자동 등록보다 우선 실행됩니다.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="border-[#1e2130] text-slate-400"
              >
                취소
              </Button>
              <Button
                onClick={handleRegister}
                disabled={registerLoading}
                className="bg-primary hover:bg-primary/90"
              >
                {registerLoading ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  "채널 등록"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BulkRegisterModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<{
    channelsRegistered: number;
    totalVideosAdded: number;
    results: Array<{ handle: string; channelName?: string; error?: string }>;
  } | null>(null);

  const handleSubmit = async () => {
    const lines = text
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const handles = lines.map((l) => {
      const { handle } = parseChannelInput(l);
      return handle ?? l;
    }).filter(Boolean);
    if (handles.length === 0) {
      toast.error("한 줄에 하나씩 URL 또는 @핸들을 입력하세요");
      return;
    }
    setLoading(true);
    setSummary(null);
    try {
      const res = await apiClient.post<{
        summary?: { channelsRegistered: number; totalVideosAdded: number };
        results?: Array<{ handle: string; channelName?: string; error?: string }>;
      }>("/api/youtube/register-channels", {
        body: { handles },
      });
      setLoading(false);
      if (res.success && res.data) {
        setSummary({
          channelsRegistered: res.data.summary?.channelsRegistered ?? 0,
          totalVideosAdded: res.data.summary?.totalVideosAdded ?? 0,
          results: res.data.results ?? [],
        });
        const errCount = (res.data.results ?? []).filter((r) => r.error).length;
        const dupOrOk = (res.data.results ?? []).length - errCount;
        toast.success(
          `${res.data.summary?.channelsRegistered ?? 0}개 등록, 영상 ${res.data.summary?.totalVideosAdded ?? 0}개 추가${errCount ? `, ${errCount}개 실패` : ""}`
        );
        onSuccess();
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">여러 채널 한번에 등록</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-500">한 줄에 하나씩 URL 또는 @핸들 입력</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"@handle1\nhttps://youtube.com/@handle2"}
          className="border-[#1e2130] bg-[#12141d] font-mono text-xs text-slate-300"
        />
        {summary && (
          <div className="rounded-lg border border-[#1e2130] bg-[#12141d] p-3 text-xs">
            <p className="font-medium text-white">
              {summary.channelsRegistered}개 등록 성공 · 영상 {summary.totalVideosAdded}개 추가
            </p>
            {summary.results.filter((r) => r.error).length > 0 && (
              <p className="mt-1 text-amber-400">
                실패: {summary.results.filter((r) => r.error).map((r) => r.handle).join(", ")}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-[#1e2130] text-slate-400">
            닫기
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="bg-primary hover:bg-primary/90">
            {loading ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChannelDetailSheet({
  channelId,
  onClose,
  onUpdate,
  onDelete,
}: {
  channelId: string;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<{
    channel: Channel;
    videos: ChannelVideo[];
  }>(`/api/channels/${channelId}`, fetcher);

  const channel = data?.channel;
  const videos = data?.videos ?? [];

  const handlePause = async () => {
    if (!channel) return;
    const res = await apiClient.put(`/api/channels/${channelId}`, {
      body: { is_monitored: !(channel.is_monitored ?? channel.autoSync) },
    });
    if (res.success) {
      toast.success(channel.is_monitored ? "일시정지됨" : "모니터링 재개");
      mutate();
      onUpdate();
    }
  };

  const handle = channel?.handle ?? channel?.youtubeHandle ?? "";
  const subs = channel?.subscriber_count ?? channel?.subscriberCount ?? "";
  const monitored = channel?.is_monitored ?? channel?.autoSync;

  return (
    <Sheet open={!!channelId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">
            {isLoading ? "로딩..." : error ? "오류" : channel?.name ?? "채널 상세"}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {error && (
            <p className="text-sm text-red-400">상세를 불러오지 못했습니다.</p>
          )}
          {channel && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#1a1d2e]">
                  {(channel.thumbnail ?? channel.thumbnail_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={(channel.thumbnail ?? channel.thumbnail_url) as string}
                      alt=""
                      className="h-12 w-12 object-cover"
                    />
                  ) : (
                    <Tv className="m-2 h-8 w-8 text-slate-500" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-white">{channel.name}</div>
                  <div className="text-xs text-slate-400">{handle || channel.id}</div>
                  <div className="text-xs text-slate-500">
                    구독자 {fmtSubs(subs)} | 영상 {channel.video_count ?? channel.videoCount ?? 0}개
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-xs", monitored ? "text-green-400" : "text-amber-400")}>
                  {monitored ? "● 활성" : "◐ 일시정지"}
                </span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePause}>
                  {monitored ? "일시정지" : "재개"}
                </Button>
              </div>
              <div className="border-t border-[#1e2130] pt-4">
                <p className="text-xs font-medium text-slate-400">이 채널의 영상</p>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {videos.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-600">영상 없음</p>
                  ) : (
                    videos.slice(0, 20).map((v) => (
                      <Link
                        key={v.id}
                        href="/dashboard/content"
                        className="flex items-center gap-3 rounded-lg border border-[#1e2130] bg-[#12141d] p-2 hover:border-[#2a2d40]"
                      >
                        <div className="h-10 w-12 shrink-0 overflow-hidden rounded bg-[#1a1d2e]">
                          {v.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnail} alt="" className="h-10 w-12 object-cover" />
                          ) : (
                            <div className="flex h-10 w-12 items-center justify-center">
                              <Video className="h-4 w-4 text-slate-500" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs text-white">{v.title}</span>
                            {v.source === "manual" && (
                              <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[8px] font-medium text-blue-400">직접</span>
                            )}
                            {v.source === "channel_auto" && (
                              <span className="shrink-0 rounded bg-green-500/20 px-1 py-0.5 text-[8px] font-medium text-green-400">자동</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {v.taskId ? (v.status === "completed" ? "완료" : "대기열 등록") : "—"}
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
              <div className="border-t border-[#1e2130] pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-900/50 text-red-400 hover:bg-red-900/10"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> 채널 삭제
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
