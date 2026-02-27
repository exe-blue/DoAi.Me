"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { RefreshCw, Search, AlertTriangle, Info, AlertOctagon, Bug } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: string;
  message?: string;
  level?: string;
  status?: string;
  device_id?: string;
  device_serial?: string;
  data?: unknown;
  created_at?: string;
}

const LEVEL_STYLE: Record<
  string,
  { color: string; bg: string; icon: React.ElementType }
> = {
  error: { color: "text-red-400", bg: "bg-red-500/10", icon: AlertOctagon },
  warn: { color: "text-amber-400", bg: "bg-amber-500/10", icon: AlertTriangle },
  info: { color: "text-primary", bg: "bg-primary/10", icon: Info },
  debug: { color: "text-muted-foreground", bg: "bg-muted", icon: Bug },
};

function buildLogsKey(params: {
  task_id?: string;
  level?: string;
  search?: string;
  limit: number;
}) {
  const sp = new URLSearchParams();
  if (params.task_id) sp.set("task_id", params.task_id);
  if (params.level && params.level !== "all") sp.set("level", params.level);
  if (params.search) sp.set("search", params.search);
  sp.set("limit", String(params.limit));
  return `/api/logs?${sp.toString()}`;
}

export function LogsContent() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [taskId, setTaskId] = useState(() => searchParams.get("task_id") ?? "");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const t = searchParams.get("task_id");
    if (t != null && t !== taskId) setTaskId(t);
  }, [searchParams, taskId]);

  const key = buildLogsKey({
    task_id: taskId || undefined,
    level: levelFilter,
    search: search || undefined,
    limit: 100,
  });

  const { data, error, isLoading, mutate } = useSWR<{ logs: LogEntry[] }>(
    key,
    fetcher,
    { refreshInterval: autoRefresh ? 10_000 : 0 }
  );

  const logs = data?.logs ?? [];

  useEffect(() => {
    if (!autoScroll || logs.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [autoScroll, logs.length]);

  const formatTime = (d: string | undefined) => {
    if (!d) return "";
    const dt = new Date(d);
    return (
      dt.toLocaleTimeString("ko-KR", { hour12: false }) +
      "." +
      String(dt.getMilliseconds()).padStart(3, "0")
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{logs.length}개 표시</p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-input"
            />
            자동 새로고침
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-input"
            />
            자동 스크롤
          </label>
          <Button onClick={() => mutate()} variant="outline" size="sm">
            <RefreshCw className="mr-1.5 h-3 w-3" /> 새로고침
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="메시지, 디바이스 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 font-mono text-xs"
          />
        </div>
        <Input
          placeholder="task_id (선택)"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          className="w-40 font-mono text-xs"
        />
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-9 w-24 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="error">ERROR</SelectItem>
            <SelectItem value="warn">WARN</SelectItem>
            <SelectItem value="info">INFO</SelectItem>
            <SelectItem value="debug">DEBUG</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center text-sm text-destructive">
          로그를 불러오지 못했습니다.{" "}
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
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-20 px-3 py-2 text-left">시각</th>
                  <th className="w-14 px-3 py-2 text-left">레벨</th>
                  <th className="w-28 px-3 py-2 text-left">디바이스</th>
                  <th className="px-3 py-2 text-left">메시지</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {logs.map((l, i) => {
                  const level =
                    l.level ?? (l.status === "failed" ? "error" : "info");
                  const st = LEVEL_STYLE[level] ?? LEVEL_STYLE.info;
                  const Icon = st.icon;
                  return (
                    <tr
                      key={l.id ?? i}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                        {formatTime(l.created_at)}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold",
                            st.bg,
                            st.color
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {(level ?? "info").toUpperCase()}
                        </span>
                      </td>
                      <td className="max-w-[110px] truncate px-3 py-1.5 text-muted-foreground">
                        {l.device_serial ?? l.device_id ?? "—"}
                      </td>
                      <td className="truncate px-3 py-1.5">
                        {l.message ??
                          (typeof l.data === "object"
                            ? JSON.stringify(l.data)
                            : "—")}
                      </td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-8 text-center text-xs text-muted-foreground"
                    >
                      로그 없음
                    </td>
                  </tr>
                )}
                <tr ref={bottomRef} />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
