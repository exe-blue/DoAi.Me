"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Tv,
  Plus,
  RefreshCw,
  Video,
  Trash2,
} from "lucide-react";
import { fetcher, apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  is_monitored?: boolean;
  last_collected_at?: string | null;
  status?: string | null;
  autoSync?: boolean;
}

interface ChannelVideo {
  id: string;
  title: string;
  status?: string;
  thumbnail?: string;
  taskId?: string | null;
  source?: "manual" | "channel_auto" | null;
}

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

const CHANNELS_KEY = "/api/channels";
const TABS = [
  { key: "all", label: "전체" },
  { key: "monitored", label: "모니터링 중" },
  { key: "paused", label: "일시정지" },
] as const;

export function ChannelsContent() {
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
    try {
      const res = await apiClient.get("/api/youtube/sync");
      if (res.success === false) {
        const msg = (res as { message?: string; error?: string }).message ?? (res as { message?: string; error?: string }).error ?? "동기화 실패";
        toast.error(msg);
        return;
      }
      toast.success("동기화 요청됨");
      mutate();
    } catch (err) {
      const message = err instanceof Error ? err.message : "동기화 실패";
      toast.error(message);
    }
  };

  const handlePause = async (id: string, isMonitored: boolean) => {
    const res = await apiClient.put(`/api/channels/${id}`, {
      body: { is_monitored: !isMonitored },
    });
    if (res.success) {
      toast.success(isMonitored ? "일시정지됨" : "모니터링 재개");
      mutate();
    } else {
      toast.error(res.error ?? "상태 변경 실패");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 채널을 삭제할까요?")) return;
    const res = await apiClient.delete(`/api/channels/${id}`);
    if (res.success) {
      toast.success("채널 삭제됨");
      setSelectedId(null);
      mutate();
    } else {
      toast.error(res.error ?? "삭제 실패");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number]["key"])}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 동기화
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 채널 추가
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          목록을 불러오지 못했습니다.{" "}
          <button type="button" onClick={() => mutate()} className="underline hover:no-underline">
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tv className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              {tab === "all" ? "등록된 채널이 없습니다" : "해당하는 채널이 없습니다"}
            </p>
            {tab === "all" && (
              <Button className="mt-4" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 첫 채널 추가
              </Button>
            )}
          </CardContent>
        </Card>
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

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-muted/50"
      onClick={onOpenDetail}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
            {thumb ? (
              <img src={thumb} alt="" className="h-14 w-14 object-cover" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center">
                <Tv className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold leading-tight">{channel.name}</div>
            <div className="text-sm text-muted-foreground">
              {handle || `채널 ID: ${channel.id.slice(0, 8)}`}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            구독자 {fmtSubs(subs)}
          </span>
          <span className="flex items-center gap-1">
            <Video className="h-3.5 w-3.5" />
            영상 {videoCount}개
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          마지막 동기화: {timeSince(lastSync)}
        </div>
        <div className="mt-2">
          <Badge variant={monitored ? "default" : "secondary"}>
            {monitored ? "모니터링 중" : "일시정지"}
          </Badge>
        </div>
        <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSync}>
            <RefreshCw className="mr-1 h-3 w-3" /> 동기화
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onPause}>
            {monitored ? "일시정지" : "재개"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3 w-3" /> 삭제
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (res.success) {
        toast.success("채널이 등록되었습니다");
        onSuccess();
        setStep(1);
        setUrl("");
        setChannelInfo(null);
      } else {
        toast.error(res.error ?? "등록 실패");
      }
    } finally {
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>채널 추가</DialogTitle>
        </DialogHeader>
        {step === 1 && (
          <>
            <p className="text-sm text-muted-foreground">
              YouTube 채널 URL 또는 핸들을 입력하세요
            </p>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtube.com/@channelname 또는 @handle"
            />
            {fetchLoading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                채널 정보를 가져오는 중...
              </p>
            )}
            {channelInfo && !fetchLoading && (
              <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                  {channelInfo.thumbnail ? (
                    <img src={channelInfo.thumbnail} alt="" className="h-12 w-12 object-cover" />
                  ) : (
                    <Tv className="m-2 h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{channelInfo.name}</div>
                  <div className="text-xs text-muted-foreground">{channelInfo.handle}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    구독자 {fmtSubs(channelInfo.subscriberCount)} · 영상 {channelInfo.videoCount ?? 0}개
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {channelInfo ? (
                <Button className="flex-1" onClick={() => setStep(2)}>
                  다음: 등록
                </Button>
              ) : (
                <Button
                  onClick={handleFetch}
                  disabled={fetchLoading || !url.trim()}
                  className="flex-1"
                >
                  정보 불러오기
                </Button>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={onOpenBulk}
            >
              여러 채널 한번에 등록
            </button>
          </>
        )}
        {step === 2 && channelInfo && (
          <>
            <div className="flex gap-3 rounded-lg border bg-muted/50 p-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                {channelInfo.thumbnail ? (
                  <img src={channelInfo.thumbnail} alt="" className="h-12 w-12 object-cover" />
                ) : (
                  <Tv className="m-2 h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="font-medium">{channelInfo.name}</div>
                <div className="text-xs text-muted-foreground">{channelInfo.handle}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  구독자 {fmtSubs(channelInfo.subscriberCount)} · 영상 {channelInfo.videoCount ?? 0}개
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                취소
              </Button>
              <Button onClick={handleRegister} disabled={registerLoading}>
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
    const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    const handles = lines
      .map((l) => {
        const { handle } = parseChannelInput(l);
        return handle ?? l;
      })
      .filter(Boolean);
    if (handles.length === 0) {
      toast.error("한 줄에 하나씩 URL 또는 @핸들을 입력하세요");
      return;
    }
    try {
      const res = await apiClient.post<{
        summary?: { channelsRegistered: number; totalVideosAdded: number };
        results?: Array<{ handle: string; channelName?: string; error?: string }>;
      }>("/api/youtube/register-channels", {
        body: { handles },
      });
      if (res.success && res.data) {
        setSummary({
          channelsRegistered: res.data.summary?.channelsRegistered ?? 0,
          totalVideosAdded: res.data.summary?.totalVideosAdded ?? 0,
          results: res.data.results ?? [],
        });
        toast.success(
          `${res.data.summary?.channelsRegistered ?? 0}개 등록, 영상 ${res.data.summary?.totalVideosAdded ?? 0}개 추가`
        );
        onSuccess();
      } else {
        toast.error(res.error ?? "등록 처리 중 오류가 발생했습니다");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>여러 채널 한번에 등록</DialogTitle>
        </DialogHeader>
        <Label className="text-muted-foreground">한 줄에 하나씩 URL 또는 @핸들 입력</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"@handle1\nhttps://youtube.com/@handle2"}
          className="font-mono text-sm"
        />
        {summary && (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            <p className="font-medium">
              {summary.channelsRegistered}개 등록 성공 · 영상 {summary.totalVideosAdded}개 추가
            </p>
            {summary.results.filter((r) => r.error).length > 0 && (
              <p className="mt-1 text-destructive">
                실패: {summary.results.filter((r) => r.error).map((r) => r.handle).join(", ")}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
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
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
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
            <p className="text-sm text-destructive">상세를 불러오지 못했습니다.</p>
          )}
          {channel && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
                  {(channel.thumbnail ?? channel.thumbnail_url) ? (
                    <img
                      src={(channel.thumbnail ?? channel.thumbnail_url) as string}
                      alt=""
                      className="h-12 w-12 object-cover"
                    />
                  ) : (
                    <Tv className="m-2 h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <div className="font-medium">{channel.name}</div>
                  <div className="text-xs text-muted-foreground">{handle || channel.id}</div>
                  <div className="text-xs text-muted-foreground">
                    구독자 {fmtSubs(subs)} | 영상 {channel.video_count ?? channel.videoCount ?? 0}개
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={monitored ? "default" : "secondary"}>
                  {monitored ? "활성" : "일시정지"}
                </Badge>
                <Button variant="outline" size="sm" onClick={handlePause}>
                  {monitored ? "일시정지" : "재개"}
                </Button>
              </div>
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">이 채널의 영상</p>
                <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                  {videos.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">영상 없음</p>
                  ) : (
                    videos.slice(0, 20).map((v) => (
                      <Link
                        key={v.id}
                        href="/content/content"
                        className="flex items-center gap-3 rounded-lg border bg-muted/50 p-2 transition-colors hover:bg-muted"
                      >
                        <div className="h-10 w-12 shrink-0 overflow-hidden rounded bg-muted">
                          {v.thumbnail ? (
                            <img src={v.thumbnail} alt="" className="h-10 w-12 object-cover" />
                          ) : (
                            <div className="flex h-10 w-12 items-center justify-center">
                              <Video className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium">{v.title}</span>
                            {v.source === "manual" && (
                              <Badge variant="secondary" className="text-[10px]">직접</Badge>
                            )}
                            {v.source === "channel_auto" && (
                              <Badge variant="outline" className="text-[10px]">자동</Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {v.taskId ? (v.status === "completed" ? "완료" : "대기열 등록") : "—"}
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
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
