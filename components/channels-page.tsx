"use client";

import Image from "next/image";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Tv,
  ExternalLink,
  Trash2,
  RefreshCw,
  Play,
  ArrowRight,
  Clock,
  Search,
  Settings2,
  Eye,
  ThumbsUp,
  MessageSquare,
  Bookmark,
  UserPlus,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SyncStatusBar } from "@/components/sync-status-bar";
import { useChannelSync } from "@/hooks/use-channel-sync";
import type { Channel, Content, TaskVariables } from "@/lib/types";

/* ──────────── Variable Dialog (same as tasks) ──────────── */

function VariableDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [vars, setVars] = useState<TaskVariables>({
    watchPercent: 80,
    commentProb: 10,
    likeProb: 40,
    saveProb: 5,
    subscribeToggle: false,
  });

  const sliderItems = [
    {
      key: "watchPercent" as const,
      label: "시청 비율",
      icon: <Eye className="h-4 w-4 text-muted-foreground" />,
      suffix: "%",
    },
    {
      key: "commentProb" as const,
      label: "댓글 확률",
      icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
      suffix: "%",
    },
    {
      key: "likeProb" as const,
      label: "좋아요 확률",
      icon: <ThumbsUp className="h-4 w-4 text-muted-foreground" />,
      suffix: "%",
    },
    {
      key: "saveProb" as const,
      label: "담기 확률",
      icon: <Bookmark className="h-4 w-4 text-muted-foreground" />,
      suffix: "%",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-base">변수 등록</DialogTitle>
          <DialogDescription className="text-sm">
            작업 실행 시 적용될 행동 변수를 설정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {sliderItems.map((item) => (
            <div key={item.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {item.icon}
                  <Label className="text-sm font-medium">{item.label}</Label>
                </div>
                <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {vars[item.key]}
                  {item.suffix}
                </span>
              </div>
              <Slider
                value={[vars[item.key]]}
                onValueChange={([v]) =>
                  setVars((prev) => ({ ...prev, [item.key]: v }))
                }
                max={100}
                min={0}
                step={1}
                className="w-full"
              />
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-sm font-medium">구독 토글</Label>
                <p className="text-xs text-muted-foreground">
                  ON/OFF 토글 형태로 구독/해제 명령 포함
                </p>
              </div>
            </div>
            <Switch
              checked={vars.subscribeToggle}
              onCheckedChange={(v) =>
                setVars((prev) => ({ ...prev, subscribeToggle: v }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onClose}>변수 저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Add Channel Dialog ──────────── */

function AddChannelDialog({
  open,
  onClose,
  onChannelAdded,
}: {
  open: boolean;
  onClose: () => void;
  onChannelAdded: (channel: Channel) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "등록 실패");
      }
      const channel = await res.json();
      onChannelAdded(channel);
      setUrl("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "등록 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>채널 등록</DialogTitle>
          <DialogDescription>
            YouTube 채널 URL을 입력하면 자동으로 채널 정보를 가져옵니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="channel-url"
              className="text-sm text-muted-foreground mb-1 block"
            >
              채널 URL 또는 핸들
            </label>
            <Input
              id="channel-url"
              placeholder="https://youtube.com/@channel"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              className="bg-secondary"
            />
          </div>
          {error && <p className="text-sm text-status-error">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !url.trim()}>
            {loading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Add Content Dialog ──────────── */

function AddContentDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>컨텐츠 등록</DialogTitle>
          <DialogDescription>
            개별 YouTube 영상을 등록합니다. URL을 입력하면 실시간으로 정보가
            표시됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="video-url"
              className="text-sm text-muted-foreground mb-1 block"
            >
              영상 URL
            </label>
            <Input
              id="video-url"
              placeholder="https://youtube.com/watch?v=..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setVideoInfo(e.target.value.length > 15);
              }}
              className="bg-secondary"
            />
          </div>

          {videoInfo && (
            <div className="rounded-md border border-border p-3 bg-secondary">
              <div className="flex gap-3">
                <div className="w-32 h-18 rounded bg-muted flex items-center justify-center shrink-0">
                  <Play className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    영상 제목 미리보기
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    채널명 / 3:27
                  </p>
                  <Badge
                    variant="outline"
                    className="mt-1 text-xs border-status-success/30 text-status-success"
                  >
                    등록 가능
                  </Badge>
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onClose}>등록</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Main Page ──────────── */

export function ChannelsPage({
  channels,
  contents,
}: {
  channels: Channel[];
  contents: Content[];
}) {
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [variableOpen, setVariableOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [realChannels, setRealChannels] = useState<Channel[] | null>(null);
  const [realContents, setRealContents] = useState<Content[] | null>(null);

  const { syncState, syncNow, setInterval: setSyncInterval, onSyncComplete, intervalMinutes } = useChannelSync();
  const syncing = syncState.isSyncing;

  const displayChannels = realChannels ?? channels;
  const displayContents = realContents ?? contents;

  // When sync completes, update local state
  useEffect(() => {
    onSyncComplete((result) => {
      setRealChannels(result.channels);
      setRealContents(result.contents);
    });
  }, [onSyncComplete]);

  // Phase 1: Load from DB cache on mount (fast)
  useEffect(() => {
    fetch("/api/channels")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRealChannels(data.channels);
          setRealContents(data.contents);
        }
      })
      .catch(() => {});
    // Phase 2: Sync with YouTube API (via hook, triggers on mount if needed)
    syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteChannel = useCallback(
    async (channelId: string) => {
      try {
        const res = await fetch("/api/youtube/channels", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: channelId }),
        });
        if (!res.ok) throw new Error("삭제 실패");
        setRealChannels((prev) =>
          prev ? prev.filter((c) => c.id !== channelId) : prev,
        );
        setRealContents((prev) =>
          prev
            ? prev.filter((c) => {
                const channel = displayChannels.find(
                  (ch) => ch.id === channelId,
                );
                return c.channelName !== channel?.name;
              })
            : prev,
        );
      } catch (err) {
        console.error("Channel delete error:", err);
      }
    },
    [displayChannels],
  );

  const handleCreateTask = useCallback(
    async (content: Content) => {
      try {
        const channel = displayChannels.find(
          (c) => c.name === content.channelName,
        );
        if (!channel) return;
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: content.id, channelId: channel.id }),
        });
        if (!res.ok) throw new Error("작업 등록 실패");
        // Update content status locally
        setRealContents((prev) =>
          prev
            ? prev.map((c) =>
                c.id === content.id
                  ? {
                      ...c,
                      status: "task_created" as const,
                      taskId: "pending",
                    }
                  : c,
              )
            : prev,
        );
      } catch (err) {
        console.error("Task creation error:", err);
      }
    },
    [displayChannels],
  );

  const filteredContents = useMemo(() => {
    if (!selectedChannel) return displayContents;
    return displayContents.filter((c) => c.channelName === selectedChannel);
  }, [displayContents, selectedChannel]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            채널 및 컨텐츠
          </h1>
          <p className="text-base text-muted-foreground">
            등록된 컨텐츠가 자동으로 작업으로 이어집니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            onClick={syncNow}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            {syncing ? "동기화 중..." : "동기화"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            onClick={() => setVariableOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            변수 등록
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddContentOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            컨텐츠 등록
          </Button>
          <Button size="sm" onClick={() => setAddChannelOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            채널 등록
          </Button>
        </div>
      </div>

      {/* Sync Status Bar */}
      <SyncStatusBar
        lastSyncAt={syncState.lastSyncAt}
        nextSyncAt={syncState.nextSyncAt}
        isSyncing={syncing}
        newVideoCount={syncState.newVideoCount}
        intervalMinutes={intervalMinutes}
        onSyncNow={syncNow}
        onIntervalChange={setSyncInterval}
      />

      {/* Channels Section */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-2">
          등록된 채널
          {selectedChannel && (
            <span className="ml-2 text-xs text-muted-foreground">
              &mdash; 선택된 채널: {selectedChannel}
            </span>
          )}
        </h2>
        {syncing && displayChannels.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">채널 정보를 불러오는 중...</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {displayChannels.map((channel) => {
            const isActive = selectedChannel === channel.name;
            return (
              <button
                type="button"
                key={channel.id}
                onClick={() =>
                  setSelectedChannel(isActive ? null : channel.name)
                }
                className={cn(
                  "rounded-lg border p-3 flex items-center gap-3 min-w-[240px] text-left transition-all",
                  isActive
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-card hover:border-muted-foreground/30",
                )}
              >
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                    isActive ? "bg-primary/20" : "bg-secondary",
                  )}
                >
                  <Tv
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium truncate",
                      isActive ? "text-primary" : "text-foreground",
                    )}
                  >
                    {channel.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {channel.subscriberCount} 구독자
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {channel.videoCount}개 영상
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {channel.autoSync ? (
                    <Badge
                      variant="outline"
                      className="text-[11px] border-status-success/30 text-status-success"
                    >
                      <RefreshCw className="h-2.5 w-2.5 mr-0.5" />
                      자동
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px]">
                      수동
                    </Badge>
                  )}
                  <div className="flex gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(
                          `https://www.youtube.com/${channel.youtubeHandle || channel.youtubeId}`,
                          "_blank",
                        );
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          window.open(
                            `https://www.youtube.com/${channel.youtubeHandle || channel.youtubeId}`,
                            "_blank",
                          );
                        }
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-muted-foreground hover:text-status-error"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteChannel(channel.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.stopPropagation();
                          handleDeleteChannel(channel.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter indicator */}
      {selectedChannel && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
          <Tv className="h-3.5 w-3.5 text-primary" />
          <span className="text-sm text-primary font-medium">
            {selectedChannel}
          </span>
          <span className="text-xs text-muted-foreground">
            의 컨텐츠만 표시 중 ({filteredContents.length}건)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedChannel(null)}
          >
            <X className="h-3 w-3 mr-1" />
            필터 해제
          </Button>
        </div>
      )}

      {/* Feed Section */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-2">
          컨텐츠 피드
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            {filteredContents.length}건
          </span>
        </h2>
        <ScrollArea className="h-[calc(100vh-440px)]">
          <div className="flex flex-col gap-2 pr-3">
            {filteredContents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Tv className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">해당 채널의 컨텐츠가 없습니다.</p>
              </div>
            ) : (
              filteredContents.map((content) => (
                <div
                  key={content.id}
                  className="rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/20 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-28 h-16 rounded bg-secondary flex items-center justify-center shrink-0 overflow-hidden relative">
                      <Image
                        src={content.thumbnail || "/placeholder.svg"}
                        alt={content.title}
                        fill
                        className="object-cover"
                        crossOrigin="anonymous"
                        unoptimized
                        onError={(e) => {
                          const target = e.currentTarget;
                          target.style.display = "none";
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="h-4 w-4 text-foreground/60" />
                      </div>
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-background/90 px-1 py-0.5 text-[10px] font-mono text-foreground">
                        {content.duration}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {content.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground font-medium">
                          {content.channelName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(content.publishedAt).toLocaleDateString(
                            "ko-KR",
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[11px]",
                            content.status === "completed" &&
                              "border-status-success/30 text-status-success",
                            content.status === "task_created" &&
                              "border-status-warning/30 text-status-warning",
                            content.status === "pending" &&
                              "border-status-neutral/30 text-status-neutral",
                          )}
                        >
                          {content.status === "completed"
                            ? "완료"
                            : content.status === "task_created"
                              ? "작업 등록됨"
                              : "대기"}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          등록:{" "}
                          {new Date(content.registeredAt).toLocaleString(
                            "ko-KR",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {content.taskId ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5 bg-transparent"
                        >
                          <ArrowRight className="h-3 w-3 mr-0.5" />
                          작업 보기
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          onClick={() => handleCreateTask(content)}
                        >
                          <Plus className="h-3 w-3 mr-0.5" />
                          작업 등록
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <AddChannelDialog
        open={addChannelOpen}
        onClose={() => setAddChannelOpen(false)}
        onChannelAdded={(channel) => {
          setRealChannels((prev) => (prev ? [...prev, channel] : [channel]));
        }}
      />
      <AddContentDialog
        open={addContentOpen}
        onClose={() => setAddContentOpen(false)}
      />
      <VariableDialog
        open={variableOpen}
        onClose={() => setVariableOpen(false)}
      />
    </div>
  );
}
