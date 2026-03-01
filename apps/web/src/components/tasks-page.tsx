"use client";

import Image from "next/image";
import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Plus,
  Square,
  ScrollText,
  Trash2,
  ChevronDown,
  ChevronRight,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  Monitor,
  Check,
  Settings2,
  ThumbsUp,
  MessageSquare,
  Bookmark,
  UserPlus,
  Eye,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Task, NodePC, TaskStatus, TaskVariables } from "@/lib/types";
import { statusTextClass, statusBadgeClass, statusDotClass } from "@/components/ui/status-indicator";
import { TaskDeviceGrid } from "@/components/task-device-grid";
import { QueuePanel } from "@/components/queue-panel";
import { SchedulesPanel } from "@/components/schedules-panel";
import { useQueueStore } from "@/hooks/use-queue-store";

/* ──────────── Status helpers ──────────── */

function getTaskStatusIcon(status: TaskStatus) {
  switch (status) {
    case "running":
      return <Play className={cn("h-4 w-4", statusTextClass("warning"))} />;
    case "queued":
      return <Clock className={cn("h-4 w-4", statusTextClass("info"))} />;
    case "completed":
      return <CheckCircle2 className={cn("h-4 w-4", statusTextClass("success"))} />;
    case "stopped":
      return <Square className={cn("h-4 w-4", statusTextClass("neutral"))} />;
    case "error":
      return <AlertCircle className={cn("h-4 w-4", statusTextClass("error"))} />;
  }
}

function getTaskStatusLabel(status: TaskStatus) {
  switch (status) {
    case "running":
      return "실행 중";
    case "queued":
      return "대기 중";
    case "completed":
      return "완료";
    case "stopped":
      return "중단됨";
    case "error":
      return "오류";
  }
}

function getTaskStatusColor(status: TaskStatus) {
  switch (status) {
    case "running":
      return statusBadgeClass("warning");
    case "queued":
      return statusBadgeClass("info");
    case "completed":
      return statusBadgeClass("success");
    case "stopped":
      return statusBadgeClass("neutral");
    case "error":
      return statusBadgeClass("error");
  }
}

/* ──────────── Log Dialog ──────────── */

function TaskLogDialog({
  open,
  onClose,
  task,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
}) {
  if (!task) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle className="text-base">
            로그 - {task.title.length > 30 ? `${task.title.slice(0, 30)}...` : task.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            작업 실행 로그를 확인합니다.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-64">
          <div className="flex flex-col gap-1 pr-3">
            {task.logs.map((log, i) => (
              <div
                key={`log-${task.id}-${i}`}
                className="font-mono text-xs text-muted-foreground px-3 py-1.5 rounded bg-secondary"
              >
                {log}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Register Task Dialog (Multi-Step) ──────────── */

type ContentMode = "single" | "channel" | "playlist";
type Distribution = "round_robin" | "random" | "by_priority";

interface Channel {
  id: string;
  name: string;
  category: string;
  video_count: number;
}

interface Video {
  id: string;
  title: string;
  priority?: string | number;
  completed_views?: number;
  status?: string;
}

type SubmitTarget = "immediate" | "queue";

function RegisterTaskDialog({
  open,
  onClose,
  nodes,
  onTaskCreated,
  defaultTarget,
}: {
  open: boolean;
  onClose: () => void;
  nodes: NodePC[];
  onTaskCreated?: () => void;
  defaultTarget?: SubmitTarget;
}) {
  // Step state
  const [step, setStep] = useState(1);
  const [submitTarget, setSubmitTarget] = useState<SubmitTarget>(defaultTarget ?? "immediate");

  // Step 1: Content Selection
  const [contentMode, setContentMode] = useState<ContentMode>("single");
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [distribution, setDistribution] = useState<Distribution>("round_robin");
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([]);

  // Step 2: Execution Config
  const [deviceCount, setDeviceCount] = useState(20);
  const [workerId, setWorkerId] = useState("");
  const [vars, setVars] = useState<TaskVariables>({
    watchPercent: 80,
    commentProb: 10,
    likeProb: 40,
    saveProb: 5,
    subscribeToggle: false,
  });

  // Data fetching
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [allVideos, setAllVideos] = useState<Video[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch channels
  useEffect(() => {
    if (open && channels.length === 0) {
      setLoadingChannels(true);
      fetch("/api/channels")
        .then((res) => res.json())
        .then((data) => setChannels(data.channels || []))
        .catch((err) => console.error("Failed to fetch channels:", err))
        .finally(() => setLoadingChannels(false));
    }
  }, [open, channels.length]);

  // Fetch videos when channel is selected (for single/channel mode)
  useEffect(() => {
    if (selectedChannelId && contentMode !== "playlist") {
      setLoadingVideos(true);
      fetch(`/api/channels/${selectedChannelId}`)
        .then((res) => res.json())
        .then((data) => setVideos(data.videos || []))
        .catch((err) => console.error("Failed to fetch videos:", err))
        .finally(() => setLoadingVideos(false));
    }
  }, [selectedChannelId, contentMode]);

  // Fetch all videos for playlist mode
  useEffect(() => {
    if (open && contentMode === "playlist" && allVideos.length === 0) {
      Promise.all(
        channels.map((ch) =>
          fetch(`/api/channels/${ch.id}`)
            .then((res) => res.json())
            .then((data) => data.videos || [])
        )
      )
        .then((results) => setAllVideos(results.flat()))
        .catch((err) => console.error("Failed to fetch all videos:", err));
    }
  }, [open, contentMode, channels, allVideos.length]);

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleNext = () => {
    setError("");
    if (step === 1) {
      // Validate Step 1
      if (contentMode === "single") {
        if (!videoUrl && !selectedVideoId) {
          setError("비디오를 선택하거나 YouTube URL을 입력하세요");
          return;
        }
      } else if (contentMode === "channel") {
        if (!selectedChannelId) {
          setError("채널을 선택하세요");
          return;
        }
      } else if (contentMode === "playlist") {
        if (selectedVideoIds.length === 0) {
          setError("최소 1개 이상의 비디오를 선택하세요");
          return;
        }
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePrev = () => {
    setError("");
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setError("");
    setSubmitting(true);

    try {
      let payload: any = {
        deviceCount,
        workerId: workerId || undefined,
        variables: vars,
      };

      if (contentMode === "single") {
        // Single video mode
        const videoId = extractVideoId(videoUrl) || selectedVideoId;
        if (!videoId) {
          throw new Error("올바른 비디오 ID 또는 URL을 입력하세요");
        }
        payload.contentMode = "single";
        payload.videoId = videoId;
      } else if (contentMode === "channel") {
        // Channel mode
        payload.contentMode = "channel";
        payload.channelId = selectedChannelId;
        payload.distribution = distribution;
      } else if (contentMode === "playlist") {
        // Playlist mode
        payload.contentMode = "playlist";
        payload.videoIds = selectedVideoIds;
        payload.distribution = distribution;
      }

      if (submitTarget === "queue") {
        // Add to queue instead of immediate execution
        const queueRes = await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_config: payload, priority: 0 }),
        });
        if (!queueRes.ok) {
          const data = await queueRes.json();
          throw new Error(data.error || "큐에 추가 실패");
        }
      } else {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "작업 등록 실패");
        }
      }

      // Reset form
      setStep(1);
      setVideoUrl("");
      setSelectedVideoId("");
      setSelectedChannelId("");
      setSelectedVideoIds([]);
      setDeviceCount(20);
      setWorkerId("");
      setVars({
        watchPercent: 80,
        commentProb: 10,
        likeProb: 40,
        saveProb: 5,
        subscribeToggle: false,
      });

      onTaskCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 등록 중 오류 발생");
    } finally {
      setSubmitting(false);
    }
  };

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

  const getPreviewText = () => {
    if (contentMode === "single") {
      return `${deviceCount}대 기기 × 1개 비디오 = ${deviceCount}회 시청 세션`;
    } else if (contentMode === "channel") {
      const channel = channels.find((ch) => ch.id === selectedChannelId);
      const videoCount = channel?.video_count || 0;
      const estimatedPerVideo =
        videoCount > 0 ? Math.floor(deviceCount / videoCount) : 0;
      return `${deviceCount}대 기기 × ${videoCount}개 비디오 = ${deviceCount}회 시청 세션 (분배: ${distribution === "round_robin" ? "순차" : distribution === "random" ? "무작위" : "우선순위"}, 영상당 ~${estimatedPerVideo}회)`;
    } else if (contentMode === "playlist") {
      const videoCount = selectedVideoIds.length;
      const estimatedPerVideo =
        videoCount > 0 ? Math.floor(deviceCount / videoCount) : 0;
      return `${deviceCount}대 기기 × ${videoCount}개 비디오 = ${deviceCount}회 시청 세션 (분배: ${distribution === "round_robin" ? "순차" : distribution === "random" ? "무작위" : "우선순위"}, 영상당 ~${estimatedPerVideo}회)`;
    }
    return "";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle className="text-base">작업 등록</DialogTitle>
          <DialogDescription className="text-sm">
            {step === 1 && "컨텐츠를 선택하세요"}
            {step === 2 && "실행 설정을 구성하세요"}
            {step === 3 && "작업을 미리보고 등록하세요"}
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-2 w-2 rounded-full transition-colors",
                s === step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step 1: Content Selection */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <RadioGroup value={contentMode} onValueChange={(v) => setContentMode(v as ContentMode)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="text-sm font-medium cursor-pointer">
                  단일 비디오
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="channel" id="channel" />
                <Label htmlFor="channel" className="text-sm font-medium cursor-pointer">
                  채널 전체
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="playlist" id="playlist" />
                <Label htmlFor="playlist" className="text-sm font-medium cursor-pointer">
                  커스텀 플레이리스트
                </Label>
              </div>
            </RadioGroup>

            {contentMode === "single" && (
              <div className="flex flex-col gap-3 p-4 border border-border rounded-lg">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">YouTube URL</Label>
                  <input
                    type="text"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="px-3 py-2 text-sm rounded-md border border-border bg-background"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground">또는</span>
                  <div className="flex-1 border-t border-border" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">채널 선택</Label>
                  <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="채널을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingChannels ? (
                        <SelectItem value="loading" disabled>
                          불러오는 중...
                        </SelectItem>
                      ) : (
                        channels.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.name} ({ch.video_count}개)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                {selectedChannelId && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-sm">비디오 선택</Label>
                    <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="비디오를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingVideos ? (
                          <SelectItem value="loading" disabled>
                            불러오는 중...
                          </SelectItem>
                        ) : (
                          videos.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {contentMode === "channel" && (
              <div className="flex flex-col gap-3 p-4 border border-border rounded-lg">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">채널 선택</Label>
                  <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="채널을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingChannels ? (
                        <SelectItem value="loading" disabled>
                          불러오는 중...
                        </SelectItem>
                      ) : (
                        channels.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.name} ({ch.video_count}개)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">분배 방식</Label>
                  <Select value={distribution} onValueChange={(v) => setDistribution(v as Distribution)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round_robin">순차 분배</SelectItem>
                      <SelectItem value="random">무작위 분배</SelectItem>
                      <SelectItem value="by_priority">우선순위 분배</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {contentMode === "playlist" && (
              <div className="flex flex-col gap-3 p-4 border border-border rounded-lg">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">비디오 선택 (다중 선택)</Label>
                  <ScrollArea className="h-48 border border-border rounded-md p-2">
                    <div className="flex flex-col gap-2">
                      {allVideos.length === 0 ? (
                        <div className="text-xs text-muted-foreground p-2">
                          비디오를 불러오는 중...
                        </div>
                      ) : (
                        allVideos.map((v) => (
                          <div key={v.id} className="flex items-center gap-2">
                            <Checkbox
                              id={v.id}
                              checked={selectedVideoIds.includes(v.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedVideoIds([...selectedVideoIds, v.id]);
                                } else {
                                  setSelectedVideoIds(selectedVideoIds.filter((id) => id !== v.id));
                                }
                              }}
                            />
                            <Label
                              htmlFor={v.id}
                              className="text-xs cursor-pointer flex-1"
                            >
                              {v.title}
                            </Label>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  <div className="text-xs text-muted-foreground">
                    {selectedVideoIds.length}개 선택됨
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">분배 방식</Label>
                  <Select value={distribution} onValueChange={(v) => setDistribution(v as Distribution)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round_robin">순차 분배</SelectItem>
                      <SelectItem value="random">무작위 분배</SelectItem>
                      <SelectItem value="by_priority">우선순위 분배</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Execution Config */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">기기 수</Label>
              <input
                type="number"
                value={deviceCount}
                onChange={(e) => setDeviceCount(Number(e.target.value))}
                min={1}
                max={1000}
                className="px-3 py-2 text-sm rounded-md border border-border bg-background"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm">Worker ID (선택)</Label>
              <Select value={workerId} onValueChange={setWorkerId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="전체 Worker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">전체 Worker</SelectItem>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name || node.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border pt-3">
              <Label className="text-sm font-semibold mb-3 block">실행 변수</Label>
              <div className="flex flex-col gap-4">
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
            </div>
          </div>
        )}

        {/* Step 3: Preview & Confirm */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-muted/30 rounded-lg border border-border">
              <h3 className="text-sm font-semibold mb-2">작업 요약</h3>
              <p className="text-sm text-muted-foreground">{getPreviewText()}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">컨텐츠 모드:</span>
                <span className="ml-2 font-medium">
                  {contentMode === "single"
                    ? "단일 비디오"
                    : contentMode === "channel"
                    ? "채널 전체"
                    : "커스텀 플레이리스트"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">기기 수:</span>
                <span className="ml-2 font-medium">{deviceCount}대</span>
              </div>
              <div>
                <span className="text-muted-foreground">시청 비율:</span>
                <span className="ml-2 font-medium">{vars.watchPercent}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">좋아요 확률:</span>
                <span className="ml-2 font-medium">{vars.likeProb}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">댓글 확률:</span>
                <span className="ml-2 font-medium">{vars.commentProb}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">담기 확률:</span>
                <span className="ml-2 font-medium">{vars.saveProb}%</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm text-status-error bg-status-error/10 border border-status-error/20 rounded-md p-3">
            {error}
          </div>
        )}

        {step === 3 && (
          <div className="flex items-center gap-3 rounded-md border p-3 bg-muted/30">
            <span className="text-sm text-muted-foreground">등록 방식:</span>
            <button
              onClick={() => setSubmitTarget("immediate")}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                submitTarget === "immediate"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              즉시 실행
            </button>
            <button
              onClick={() => setSubmitTarget("queue")}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                submitTarget === "queue"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              큐에 추가
            </button>
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={handlePrev} disabled={submitting}>
              이전
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={handleNext}>다음</Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  등록 중...
                </>
              ) : submitTarget === "queue" ? (
                "큐에 추가"
              ) : (
                "작업 등록"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Task Item ──────────── */

function TaskItem({
  task,
  onViewLog,
  onTogglePriority,
  onDeleteTask,
  onStopTask,
}: {
  task: Task;
  onViewLog: (task: Task) => void;
  onTogglePriority: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onStopTask: (taskId: string) => void;
}) {
  const [showDeviceGrid, setShowDeviceGrid] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/20 transition-colors">
      <div className="flex items-start gap-4">
        {/* Thumbnail */}
        <div className="w-36 h-20 rounded-md bg-secondary shrink-0 overflow-hidden relative">
          <Image
            src={task.thumbnail || "/placeholder.svg"}
            alt={task.title}
            fill
            className="object-cover"
            crossOrigin="anonymous"
            unoptimized
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              const parent = target.parentElement;
              if (parent && !parent.querySelector(".fallback-icon")) {
                const fallback = document.createElement("div");
                fallback.className =
                  "fallback-icon absolute inset-0 flex items-center justify-center";
                fallback.innerHTML =
                  '<svg class="h-6 w-6 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
                parent.appendChild(fallback);
              }
            }}
          />
          <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-mono font-medium text-foreground">
            {task.duration}
          </span>
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            {getTaskStatusIcon(task.status)}
            <span
              className="text-sm font-semibold text-foreground truncate"
              title={task.title}
            >
              {task.title.length > 32
                ? `${task.title.slice(0, 32)}...`
                : task.title}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0 px-2",
                getTaskStatusColor(task.status),
              )}
            >
              {getTaskStatusLabel(task.status)}
            </Badge>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="font-medium">{task.channelName}</span>
            <span>
              기기: {task.assignedDevices}/{task.totalDevices}
            </span>
            <span>
              등록:{" "}
              {new Date(task.createdAt).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Variables mini display */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {task.variables.watchPercent}%
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" /> {task.variables.likeProb}%
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> {task.variables.commentProb}%
            </span>
            <span className="flex items-center gap-1">
              <Bookmark className="h-3 w-3" /> {task.variables.saveProb}%
            </span>
            {task.variables.subscribeToggle && (
              <span className="flex items-center gap-1 text-primary">
                <UserPlus className="h-3 w-3" /> ON
              </span>
            )}
          </div>

          {task.status === "running" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Progress value={task.progress} className="h-1.5 flex-1" />
                <span className="text-xs font-mono text-muted-foreground">
                  {task.progress}%
                </span>
              </div>
              {task.result?.total != null && (
                <span className="text-xs text-gray-400">
                  {task.result.done || 0}/{task.result.total} 성공
                  {(task.result.failed as number) > 0 && (
                    <span className="text-red-400 ml-1">{task.result.failed} 실패</span>
                  )}
                </span>
              )}
            </div>
          )}

          {task.status === "completed" && task.completedAt && (
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className={cn("h-3.5 w-3.5", statusTextClass("success"))} />
              <span className={cn("text-xs", statusTextClass("success"))}>
                완료:{" "}
                {new Date(task.completedAt).toLocaleString("ko-KR", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex flex-col gap-2 shrink-0 items-end">
          {/* Priority switch */}
          {(task.status === "queued" || task.status === "running") && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">우선순위</span>
              <Switch
                checked={task.isPriority}
                onCheckedChange={() => onTogglePriority(task.id)}
                className={cn(
                  task.isPriority &&
                    "data-[state=checked]:bg-status-warning",
                )}
              />
            </div>
          )}
          {task.status === "running" && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-7 text-xs px-3 bg-transparent",
                "border-status-warning/30 text-status-warning hover:bg-status-warning/10"
              )}
              onClick={() => onStopTask(task.id)}
            >
              <Square className="h-3 w-3 mr-1" />
              중단
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-3 bg-transparent"
            onClick={() => setShowDeviceGrid(!showDeviceGrid)}
          >
            <Monitor className="h-3 w-3 mr-1" />
            기기 현황
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-3 bg-transparent"
            onClick={() => onViewLog(task)}
          >
            <ScrollText className="h-3 w-3 mr-1" />
            로그
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-7 text-xs px-3 bg-transparent",
              "border-status-error/30 text-status-error hover:bg-status-error/10"
            )}
            onClick={() => onDeleteTask(task.id)}
          >
            <Trash2 className="h-3 w-3 mr-1" />
            삭제
          </Button>
        </div>
      </div>

      {/* Device Grid (expandable) */}
      {showDeviceGrid && (
        <div className="mt-3 pt-3 border-t border-border">
          <TaskDeviceGrid taskId={task.id} taskStatus={task.status} />
        </div>
      )}
    </div>
  );
}

/* ──────────── Main Page ──────────── */

export function TasksPage({
  tasks: initialTasks,
  nodes,
}: {
  tasks: Task[];
  nodes: NodePC[];
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [loading, setLoading] = useState(true);
  const [logTask, setLogTask] = useState<Task | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerTarget, setRegisterTarget] = useState<SubmitTarget>("immediate");
  const [activeTab, setActiveTab] = useState("tasks");
  const queuedCount = useQueueStore((s) => s.stats.queued);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const data = await res.json();
      setTasks(data.tasks);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [tasks]);

  const stats = useMemo(() => {
    const s = { running: 0, queued: 0, completed: 0, stopped: 0, error: 0 };
    for (const t of tasks) s[t.status]++;
    return s;
  }, [tasks]);

  const handleTogglePriority = useCallback(async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const newPriority = task.isPriority ? 10 : 1;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, isPriority: !t.isPriority, priority: newPriority } : t));
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, priority: newPriority }),
      });
    } catch (err) {
      console.error("Priority update error:", err);
    }
  }, [tasks]);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      if (!res.ok) throw new Error("삭제 실패");
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error("Task delete error:", err);
    }
  }, []);

  const handleStopTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: "stopped" }),
      });
      if (!res.ok) throw new Error("중단 실패");
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "stopped" as const } : t));
    } catch (err) {
      console.error("Task stop error:", err);
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">작업 관리</h1>
          <p className="text-base text-muted-foreground">
            작업 실행, 큐, 자동 스케줄을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "queue" ? (
            <Button
              size="sm"
              onClick={() => {
                setRegisterTarget("queue");
                setRegisterOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              큐에 추가
            </Button>
          ) : activeTab === "tasks" ? (
            <Button
              size="sm"
              onClick={() => {
                setRegisterTarget("immediate");
                setRegisterOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              작업 등록
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="tasks" className="gap-1.5">
            작업 목록
            {stats.running > 0 && (
              <Badge variant="outline" className={cn("text-xs ml-1 px-1.5 py-0", statusBadgeClass("warning"))}>
                {stats.running}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-1.5">
            큐
            {queuedCount > 0 && (
              <Badge variant="outline" className={cn("text-xs ml-1 px-1.5 py-0", statusBadgeClass("info"))}>
                {queuedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="schedules">스케줄</TabsTrigger>
        </TabsList>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <div className="flex items-center gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-1.5 text-base">
              <div className={cn("h-2.5 w-2.5 rounded-full", statusDotClass("warning"))} />
              <span className="text-muted-foreground">
                실행 중 {stats.running}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-base">
              <div className={cn("h-2.5 w-2.5 rounded-full", statusDotClass("info"))} />
              <span className="text-muted-foreground">대기 {stats.queued}</span>
            </div>
            <div className="flex items-center gap-1.5 text-base">
              <div className={cn("h-2.5 w-2.5 rounded-full", statusDotClass("success"))} />
              <span className="text-muted-foreground">완료 {stats.completed}</span>
            </div>
            <div className="flex items-center gap-1.5 text-base">
              <div className={cn("h-2.5 w-2.5 rounded-full", statusDotClass("neutral"))} />
              <span className="text-muted-foreground">중단 {stats.stopped}</span>
            </div>
          </div>

          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">작업 목록을 불러오는 중...</span>
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="flex flex-col gap-3 pr-3">
              {sortedTasks.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <ScrollText className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">등록된 작업이 없습니다.</p>
                  <p className="text-xs mt-1">채널 페이지에서 컨텐츠를 작업으로 등록하세요.</p>
                </div>
              ) : (
                sortedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onViewLog={(t) => setLogTask(t)}
                    onTogglePriority={handleTogglePriority}
                    onDeleteTask={handleDeleteTask}
                    onStopTask={handleStopTask}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Queue Tab */}
        <TabsContent value="queue" className="mt-4">
          <QueuePanel />
        </TabsContent>

        {/* Schedules Tab */}
        <TabsContent value="schedules" className="mt-4">
          <SchedulesPanel />
        </TabsContent>
      </Tabs>

      <TaskLogDialog
        open={!!logTask}
        onClose={() => setLogTask(null)}
        task={logTask}
      />
      <RegisterTaskDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        nodes={nodes}
        onTaskCreated={fetchTasks}
        defaultTarget={registerTarget}
      />
    </div>
  );
}
