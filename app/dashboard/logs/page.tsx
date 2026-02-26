"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import useSWR from "swr";
import { FileText, RefreshCw, Search, AlertTriangle, Info, AlertOctagon, Bug } from "lucide-react";
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

interface LogEntry {
  id: string;
  message?: string;
  level?: string;
  status?: string;
  device_id?: string;
  device_serial?: string;
  data?: unknown;
  details?: unknown;
  created_at?: string;
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const LEVEL_STYLE: Record<
  string,
  { color: string; bg: string; icon: React.ElementType }
> = {
  error: { color: "text-red-400", bg: "bg-red-900/20", icon: AlertOctagon },
  warn: { color: "text-amber-400", bg: "bg-amber-900/20", icon: AlertTriangle },
  info: { color: "text-primary", bg: "bg-primary/10", icon: Info },
  debug: { color: "text-slate-500", bg: "bg-slate-800", icon: Bug },
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

export default function LogsPage() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [taskId, setTaskId] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLTableRowElement>(null);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">로그</h1>
          <p className="text-sm text-slate-500">{logs.length}개 표시</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-600 bg-[#12141d]"
            />
            자동 새로고침
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-slate-600 bg-[#12141d]"
            />
            자동 스크롤
          </label>
          <Button
            onClick={() => mutate()}
            variant="outline"
            size="sm"
            className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:text-white"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" /> 새로고침
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500" />
          <Input
            placeholder="메시지, 디바이스 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-[#1e2130] bg-[#12141d] pl-8 font-mono text-xs text-slate-300"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-24 border-[#1e2130] bg-[#12141d] text-xs text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="error">ERROR</SelectItem>
            <SelectItem value="warn">WARN</SelectItem>
            <SelectItem value="info">INFO</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
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
        <div className="overflow-hidden rounded-xl border border-[#1e2130] bg-[#0d1117]">
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-[#0d1117]">
                <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                  <th className="w-20 px-3 py-2 text-left">시각</th>
                  <th className="w-14 px-3 py-2 text-left">레벨</th>
                  <th className="w-28 px-3 py-2 text-left">디바이스</th>
                  <th className="px-3 py-2 text-left">메시지</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px]">
                {logs.map((l, i) => {
                  const level =
                    l.level ?? (l.status === "failed" ? "error" : "info");
                  const st = LEVEL_STYLE[level] ?? LEVEL_STYLE.info;
                  const Icon = st.icon;
                  return (
                    <tr
                      key={l.id ?? i}
                      className="border-b border-[#1e2130]/20 hover:bg-[#12141d]/50"
                    >
                      <td className="whitespace-nowrap px-3 py-1 text-slate-600">
                        {formatTime(l.created_at)}
                      </td>
                      <td className="px-3 py-1">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1 py-0.5 text-[9px] font-bold",
                            st.bg,
                            st.color
                          )}
                        >
                          <Icon className="h-2.5 w-2.5" />
                          {(level ?? "info").toUpperCase()}
                        </span>
                      </td>
                      <td className="max-w-[110px] truncate px-3 py-1 text-slate-500">
                        {l.device_serial ?? l.device_id ?? "—"}
                      </td>
                      <td className="truncate px-3 py-1 text-slate-400">
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
                      className="px-3 py-8 text-center text-xs text-slate-600"
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
