"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  RefreshCw,
  ScrollText,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { TaskDeviceRow } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* ──────────── Types ──────────── */

interface DeviceSummary {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

interface TaskDeviceGridProps {
  taskId: string;
  taskStatus: string;
}

/* ──────────── Helpers ──────────── */

function computeSummary(devices: TaskDeviceRow[]): DeviceSummary {
  const summary: DeviceSummary = {
    total: devices.length,
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const d of devices) {
    const s = d.status ?? "pending";
    if (s === "done" || s === "completed") summary.completed++;
    else if (s === "running" || s === "assigned") summary.running++;
    else if (s === "failed") summary.failed++;
    else if (s === "cancelled" || s === "timeout") summary.skipped++;
    else summary.pending++;
  }
  return summary;
}

function getDeviceCellColor(status: string | null): string {
  const s = status ?? "pending";
  if (s === "done" || s === "completed") return "bg-green-500/80 text-white";
  if (s === "running" || s === "assigned") return "bg-blue-500/70 text-white";
  if (s === "failed") return "bg-red-500/80 text-white";
  if (s === "cancelled" || s === "timeout") return "bg-gray-500/50 text-gray-300";
  return "bg-muted text-muted-foreground";
}

function getStatusLabel(status: string | null): string {
  const s = status ?? "pending";
  switch (s) {
    case "done":
    case "completed":
      return "완료";
    case "running":
    case "assigned":
      return "실행중";
    case "failed":
      return "실패";
    case "cancelled":
      return "취소됨";
    case "timeout":
      return "시간초과";
    default:
      return "대기";
  }
}

/* ──────────── Progress Bar ──────────── */

function ProgressSummaryBar({ summary }: { summary: DeviceSummary }) {
  if (summary.total === 0) return null;
  const pct = (n: number) => (n / summary.total) * 100;

  return (
    <div className="flex flex-col gap-2">
      {/* Stacked bar */}
      <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
        {summary.completed > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${pct(summary.completed)}%` }}
          />
        )}
        {summary.running > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${pct(summary.running)}%` }}
          />
        )}
        {summary.failed > 0 && (
          <div
            className="bg-red-500 transition-all"
            style={{ width: `${pct(summary.failed)}%` }}
          />
        )}
        {summary.skipped > 0 && (
          <div
            className="bg-gray-500 transition-all"
            style={{ width: `${pct(summary.skipped)}%` }}
          />
        )}
      </div>

      {/* Counts */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          완료 {summary.completed}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          실행중 {summary.running}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          실패 {summary.failed}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground" />
          대기 {summary.pending}
        </span>
        {summary.skipped > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-500" />
            건너뜀 {summary.skipped}
          </span>
        )}
        <span className="ml-auto font-medium">
          총 {summary.total}
        </span>
      </div>
    </div>
  );
}

/* ──────────── Device Cell ──────────── */

function DeviceCell({ device }: { device: TaskDeviceRow }) {
  const shortSerial = device.device_serial.slice(0, 6);
  const statusLabel = getStatusLabel(device.status);
  const cellColor = getDeviceCellColor(device.status);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "rounded-md p-1.5 text-center text-[10px] font-mono leading-tight cursor-default transition-colors",
              cellColor
            )}
          >
            <div className="truncate font-medium">{shortSerial}</div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px]">
          <div className="flex flex-col gap-1 text-xs">
            <div className="font-medium">{device.device_serial}</div>
            <div>상태: {statusLabel}</div>
            {device.error && (
              <div className="text-red-400 break-all">오류: {device.error}</div>
            )}
            {device.duration_ms != null && (
              <div>소요: {(device.duration_ms / 1000).toFixed(1)}초</div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ──────────── Failed Devices Section ──────────── */

function FailedDevicesSection({
  devices,
  taskId,
}: {
  devices: TaskDeviceRow[];
  taskId: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const failedDevices = devices.filter(
    (d) => d.status === "failed"
  );

  if (failedDevices.length === 0) return null;

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/tasks/${taskId}/retry`, { method: "POST" });
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 mt-3">
      <div
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-red-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-red-400" />
          )}
          <AlertCircle className="h-4 w-4 text-red-400" />
          <span className="font-medium text-red-400">
            실패한 기기 ({failedDevices.length})
          </span>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={handleRetry}
            disabled={retrying}
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", retrying && "animate-spin")} />
            재시도
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            asChild
          >
            <a href={`/dashboard/logs?task_id=${taskId}`}>
              <ScrollText className="h-3 w-3 mr-1" />
              로그 보기
            </a>
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {failedDevices.map((device) => (
            <div
              key={device.id}
              className="flex items-start gap-3 rounded-md bg-background/50 p-2 text-xs"
            >
              <span className="font-mono text-muted-foreground shrink-0">
                {device.device_serial.slice(0, 8)}
              </span>
              <span className="text-red-400 break-all">
                {device.error || "알 수 없는 오류"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────── Main Component ──────────── */

export function TaskDeviceGrid({ taskId, taskStatus }: TaskDeviceGridProps) {
  const [devices, setDevices] = useState<TaskDeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const isLive = taskStatus === "running" || taskStatus === "assigned";

  // Fetch devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/devices`);
      if (!res.ok) return;
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Subscribe to realtime progress for live tasks
  useEffect(() => {
    if (!isLive) return;

    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`room:task:${taskId}:devices`)
      .on("broadcast", { event: "progress" }, ({ payload }) => {
        // Refetch full device list on progress events
        fetchDevices();
      })
      .on("broadcast", { event: "update" }, ({ payload }) => {
        fetchDevices();
      })
      .subscribe();

    channelRef.current = channel;

    // Periodic refresh for live tasks as backup
    const interval = setInterval(fetchDevices, 10000);

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      clearInterval(interval);
    };
  }, [taskId, isLive, fetchDevices]);

  const summary = useMemo(() => computeSummary(devices), [devices]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        <span className="ml-2 text-xs">기기 정보를 불러오는 중...</span>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground">
        할당된 기기가 없습니다.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Progress Summary */}
      <ProgressSummaryBar summary={summary} />

      {/* Device Grid */}
      <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5">
        {devices.map((device) => (
          <DeviceCell key={device.id} device={device} />
        ))}
      </div>

      {/* Failed Devices */}
      <FailedDevicesSection devices={devices} taskId={taskId} />
    </div>
  );
}
