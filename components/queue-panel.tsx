"use client";

import { useEffect, useCallback } from "react";
import {
  ArrowUp,
  ArrowDown,
  X,
  Zap,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useQueueStore, type QueueItem } from "@/hooks/use-queue-store";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { statusBadgeClass } from "@/components/ui/status-indicator";

export function QueuePanel() {
  const { items, stats, loading, fetch: fetchQueue, updatePriority, cancel } = useQueueStore();
  const maxConcurrent = useSettingsStore((s) => s.getValue<number>("max_concurrent_tasks", 20));

  useEffect(() => {
    fetchQueue();
    // Poll every 10s to keep in sync with dispatcher
    const interval = setInterval(() => fetchQueue(), 10000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const handleDispatchNow = useCallback(
    async (item: QueueItem) => {
      // Set highest priority to move to front of queue
      await updatePriority(item.id, 9999);
      await fetchQueue();
    },
    [updatePriority, fetchQueue]
  );

  const handlePriorityUp = useCallback(
    async (item: QueueItem) => {
      await updatePriority(item.id, item.priority + 1);
    },
    [updatePriority]
  );

  const handlePriorityDown = useCallback(
    async (item: QueueItem) => {
      await updatePriority(item.id, Math.max(0, item.priority - 1));
    },
    [updatePriority]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{stats.queued}</span> 대기
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{stats.running}</span> 실행 중
            <span className="text-xs ml-1">/ {maxConcurrent} max</span>
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground">
          디스패치 주기: ~10초
        </span>
      </div>

      {/* Queue Items */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">큐가 비어있습니다.</p>
          <p className="text-xs mt-1">작업 등록 시 &quot;큐에 추가&quot;를 선택하세요.</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="flex flex-col gap-2 pr-3">
            {items.map((item, idx) => (
              <QueueItemCard
                key={item.id}
                item={item}
                index={idx + 1}
                onCancel={() => cancel(item.id)}
                onDispatchNow={() => handleDispatchNow(item)}
                onPriorityUp={() => handlePriorityUp(item)}
                onPriorityDown={() => handlePriorityDown(item)}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

/* ──────────── Queue Item Card ──────────── */

function QueueItemCard({
  item,
  index,
  onCancel,
  onDispatchNow,
  onPriorityUp,
  onPriorityDown,
}: {
  item: QueueItem;
  index: number;
  onCancel: () => void;
  onDispatchNow: () => void;
  onPriorityUp: () => void;
  onPriorityDown: () => void;
}) {
  const config = item.task_config;
  const contentMode = (config.contentMode as string) || "single";
  const deviceCount = (config.deviceCount as number) || (config.device_count as number) || 20;

  // Build summary text
  let summary = "";
  if (contentMode === "single") {
    summary = `단일 비디오 · ${deviceCount}대`;
  } else if (contentMode === "channel") {
    summary = `채널 전체 · ${deviceCount}대`;
  } else if (contentMode === "playlist") {
    const videoCount = (config.videoIds as string[])?.length || 0;
    summary = `플레이리스트 (${videoCount}개) · ${deviceCount}대`;
  } else {
    summary = `태스크 · ${deviceCount}대`;
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/20 transition-colors">
      {/* Index */}
      <span className="text-xs font-mono text-muted-foreground w-6 text-center shrink-0">
        #{index}
      </span>

      {/* Priority */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          onClick={onPriorityUp}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <ArrowUp className="h-3 w-3" />
        </button>
        <Badge variant="outline" className="text-xs font-mono px-1.5 py-0">
          {item.priority}
        </Badge>
        <button
          onClick={onPriorityDown}
          className="h-5 w-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        >
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge
            variant="outline"
            className={cn("text-xs", statusBadgeClass("info"))}
          >
            {contentMode === "single"
              ? "단일"
              : contentMode === "channel"
              ? "채널"
              : contentMode === "playlist"
              ? "플리"
              : "태스크"}
          </Badge>
          <span className="text-sm text-foreground truncate">{summary}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          등록: {new Date(item.created_at).toLocaleString("ko-KR", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs px-2 gap-1"
          onClick={onDispatchNow}
          title="즉시 디스패치 (우선순위 최상위로)"
        >
          <Zap className="h-3 w-3" />
          즉시 실행
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={onCancel}
          title="취소"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
