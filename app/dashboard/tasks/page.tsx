"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ListOrdered,
  RefreshCw,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Trash2,
  Smartphone,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Task {
  id: string;
  title?: string;
  video_id?: string;
  type?: string;
  task_type?: string;
  status: string;
  device_count?: number;
  payload?: Record<string, unknown>;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: unknown;
}

interface TaskDevice {
  id: string;
  device_serial?: string;
  status?: string;
  final_duration_sec?: number;
  watch_percentage?: number;
  did_like?: boolean;
  did_comment?: boolean;
  error_log?: string;
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

const TABS = [
  { key: "all", label: "전체" },
  { key: "running", label: "실행중" },
  { key: "pending", label: "대기" },
  { key: "completed", label: "완료" },
  { key: "failed", label: "실패" },
];

const ST: Record<
  string,
  { color: string; icon: React.ElementType; label: string }
> = {
  pending: { color: "text-slate-400", icon: Clock, label: "대기" },
  queued: { color: "text-slate-400", icon: Clock, label: "대기" },
  running: { color: "text-primary", icon: Play, label: "실행중" },
  completed: { color: "text-green-400", icon: CheckCircle2, label: "완료" },
  failed: { color: "text-red-400", icon: XCircle, label: "실패" },
  cancelled: { color: "text-slate-500", icon: Pause, label: "취소" },
  timeout: { color: "text-amber-400", icon: Clock, label: "타임아웃" },
};

export default function TasksPage() {
  const [tab, setTab] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [taskDevices, setTaskDevices] = useState<Record<string, TaskDevice[]>>({});

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<{ tasks: Task[] }>("/api/tasks", fetcher, {
    refreshInterval: 30_000,
  });

  const tasks = data?.tasks ?? [];
  const filtered =
    tab === "all"
      ? tasks
      : tasks.filter((t) => {
          if (tab === "pending") return t.status === "pending" || t.status === "queued";
          return t.status === tab;
        });

  const counts: Record<string, number> = { all: tasks.length };
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  counts.pending = (counts.pending ?? 0) + (counts.queued ?? 0);

  const toggleExpand = async (taskId: string) => {
    if (expanded === taskId) {
      setExpanded(null);
      return;
    }
    setExpanded(taskId);
    if (!taskDevices[taskId]) {
      const res = await apiClient.get<{ devices: TaskDevice[] }>(
        `/api/tasks/${taskId}/devices`
      );
      const list = res.success && res.data?.devices ? res.data.devices : [];
      if (!res.success && res.error) toast.error(res.error);
      setTaskDevices((prev) => ({ ...prev, [taskId]: list }));
    }
  };

  const handleRetry = async (taskId: string) => {
    const res = await apiClient.post<{ task: unknown; retried_devices: number }>(
      `/api/tasks/${taskId}/retry`,
      { body: {} }
    );
    if (res.success) {
      toast.success(`재시도 요청됨 (${res.data?.retried_devices ?? 0}대)`);
      mutate();
    }
  };

  const handleCancel = async (taskId: string) => {
    const res = await apiClient.patch("/api/tasks", {
      body: { id: taskId, status: "cancelled" },
    });
    if (res.success) {
      toast.success("태스크 취소됨");
      mutate();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">대기열</h1>
          <p className="text-sm text-slate-500">{tasks.length}개 태스크</p>
        </div>
        <Button
          onClick={() => mutate()}
          variant="outline"
          size="sm"
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:text-white"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 새로고침
        </Button>
      </div>

      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-[#1a1d2e] text-white" : "text-slate-500 hover:text-slate-300"
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-mono",
                tab === t.key ? "bg-primary/20 text-primary" : "bg-[#1e2130] text-slate-500"
              )}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        ))}
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
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <ListOrdered className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">태스크 없음</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const st = ST[t.status] ?? ST.pending;
            const Icon = st.icon;
            const isExp = expanded === t.id;
            const devices = taskDevices[t.id] ?? [];
            const title =
              t.title ?? (t.payload as { title?: string })?.title ?? t.video_id ?? t.id?.slice(0, 8);
            const taskType = t.task_type ?? t.type ?? "youtube";

            return (
              <div
                key={t.id}
                className="overflow-hidden rounded-xl border border-[#1e2130] bg-[#12141d] transition-colors hover:border-[#2a2d40]"
              >
                <div
                  className="flex cursor-pointer items-center gap-4 p-4"
                  onClick={() => toggleExpand(t.id)}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", st.color)} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {title}
                      </span>
                      <span className="rounded bg-[#1a1d2e] px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                        {taskType}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className={st.color}>{st.label}</span>
                      {t.device_count != null && (
                        <span className="flex items-center gap-0.5">
                          <Smartphone className="h-3 w-3" />
                          {t.device_count}대
                        </span>
                      )}
                      <span>{timeSince(t.created_at)}</span>
                    </div>
                  </div>

                  <div
                    className="flex shrink-0 items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t.status === "failed" && (
                      <button
                        type="button"
                        onClick={() => handleRetry(t.id)}
                        className="flex items-center gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] px-2.5 py-1 text-[10px] text-amber-400 hover:bg-amber-900/10"
                      >
                        <RotateCcw className="h-3 w-3" /> 재시도
                      </button>
                    )}
                    {(t.status === "pending" ||
                      t.status === "queued" ||
                      t.status === "running") && (
                      <button
                        type="button"
                        onClick={() => handleCancel(t.id)}
                        className="flex items-center gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] px-2.5 py-1 text-[10px] text-red-400 hover:bg-red-900/10"
                      >
                        <Trash2 className="h-3 w-3" /> 취소
                      </button>
                    )}
                    {isExp ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </div>

                {isExp && (
                  <div className="border-t border-[#1e2130] bg-[#0d1117]">
                    {devices.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-slate-600">
                        디바이스 정보 없음
                      </p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                              <th className="px-4 py-2 text-left">디바이스</th>
                              <th className="px-4 py-2 text-left">상태</th>
                              <th className="px-4 py-2 text-left">시청률</th>
                              <th className="px-4 py-2 text-left">액션</th>
                              <th className="px-4 py-2 text-left">에러</th>
                            </tr>
                          </thead>
                          <tbody>
                            {devices.map((d) => {
                              const ds = ST[d.status ?? "pending"] ?? ST.pending;
                              const DIcon = ds.icon;
                              return (
                                <tr
                                  key={d.id}
                                  className="border-b border-[#1e2130]/30"
                                >
                                  <td className="px-4 py-1.5 font-mono text-slate-400">
                                    {d.device_serial ?? "—"}
                                  </td>
                                  <td className="px-4 py-1.5">
                                    <span
                                      className={cn(
                                        "flex items-center gap-1",
                                        ds.color
                                      )}
                                    >
                                      <DIcon className="h-3 w-3" />
                                      {ds.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <div className="h-1 w-12 rounded-full bg-[#1e2130]">
                                        <div
                                          className="h-1 rounded-full bg-primary"
                                          style={{
                                            width: `${d.watch_percentage ?? 0}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="font-mono text-slate-500">
                                        {d.watch_percentage ?? 0}%
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-1.5 text-slate-500">
                                    {d.did_like && "❤️"}
                                    {d.did_comment && "💬"}
                                    {!d.did_like && !d.did_comment && "—"}
                                  </td>
                                  <td className="max-w-[120px] truncate px-4 py-1.5 text-red-400">
                                    {d.error_log ?? ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
