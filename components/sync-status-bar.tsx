"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Clock, Bell, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface SyncStatusBarProps {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  isSyncing: boolean;
  newVideoCount: number;
  intervalMinutes: number;
  onSyncNow: () => void;
  onIntervalChange: (minutes: number) => void;
}

const INTERVAL_OPTIONS = [
  { label: "5분", value: 5 },
  { label: "10분", value: 10 },
  { label: "15분", value: 15 },
  { label: "30분", value: 30 },
  { label: "1시간", value: 60 },
];

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function useCountdown(targetDate: string | null) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    if (!targetDate) {
      setRemaining("");
      return;
    }

    function update() {
      const diff = new Date(targetDate!).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("곧 동기화");
        return;
      }
      const min = Math.floor(diff / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      setRemaining(`${min}:${sec.toString().padStart(2, "0")}`);
    }

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return remaining;
}

export function SyncStatusBar({
  lastSyncAt,
  nextSyncAt,
  isSyncing,
  newVideoCount,
  intervalMinutes,
  onSyncNow,
  onIntervalChange,
}: SyncStatusBarProps) {
  const countdown = useCountdown(nextSyncAt);

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card text-sm">
      {/* Sync button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onSyncNow}
        disabled={isSyncing}
      >
        {isSyncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
      </Button>

      {/* Last sync */}
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span className="text-xs">
          {lastSyncAt ? formatTimeAgo(lastSyncAt) : "동기화 전"}
        </span>
      </div>

      {/* Next sync countdown */}
      {countdown && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-xs">다음:</span>
          <span className="text-xs font-mono tabular-nums">{countdown}</span>
        </div>
      )}

      {/* New videos badge */}
      {newVideoCount > 0 && (
        <Badge
          variant="outline"
          className="text-[10px] border-status-success/30 text-status-success gap-1"
        >
          <Bell className="h-2.5 w-2.5" />
          새 영상 {newVideoCount}건
        </Badge>
      )}

      {/* Interval selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground ml-auto"
          >
            {INTERVAL_OPTIONS.find((o) => o.value === intervalMinutes)?.label ?? `${intervalMinutes}분`}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[100px]">
          {INTERVAL_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onIntervalChange(option.value)}
              className={cn(
                "text-xs",
                option.value === intervalMinutes && "font-semibold text-primary"
              )}
            >
              {option.label}
              {option.value === intervalMinutes && " ✓"}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
