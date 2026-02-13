"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  ScrollText,
  Search,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { TaskLogRow } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

/* ──────────── Types ──────────── */

interface TaskOption {
  id: string;
  title: string;
  status: string;
}

/* ──────────── Helpers ──────────── */

const LEVEL_CONFIG: Record<string, { color: string; label: string }> = {
  info: {
    color: "border-blue-500/30 text-blue-500 bg-blue-500/10",
    label: "INFO",
  },
  debug: {
    color: "border-gray-500/30 text-gray-500 bg-gray-500/10",
    label: "DEBUG",
  },
  warn: {
    color: "border-yellow-500/30 text-yellow-500 bg-yellow-500/10",
    label: "WARN",
  },
  error: {
    color: "border-red-500/30 text-red-500 bg-red-500/10",
    label: "ERROR",
  },
  fatal: {
    color: "border-red-700/30 text-red-700 bg-red-700/10",
    label: "FATAL",
  },
};

function getLevelConfig(level: string | null) {
  return LEVEL_CONFIG[level ?? "info"] ?? LEVEL_CONFIG.info;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "--:--:--.---";
  const d = new Date(ts);
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hour12: false,
  });
}

const MAX_LOGS = 5000;

/* ──────────── Log Row ──────────── */

function LogRow({ log }: { log: TaskLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const config = getLevelConfig(log.level);
  const hasMeta = log.request || log.response;

  return (
    <div className="group">
      <div
        className={cn(
          "flex items-start gap-2 px-3 py-1.5 font-mono text-xs hover:bg-muted/50 transition-colors",
          hasMeta && "cursor-pointer"
        )}
        onClick={() => hasMeta && setExpanded(!expanded)}
      >
        {hasMeta ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatTimestamp(log.created_at)}
        </span>

        {log.device_serial && (
          <span className="text-muted-foreground shrink-0 max-w-[80px] truncate">
            [{log.device_serial.slice(0, 8)}]
          </span>
        )}

        <Badge
          variant="outline"
          className={cn("text-[10px] px-1.5 py-0 h-4 shrink-0 font-mono", config.color)}
        >
          {config.label}
        </Badge>

        <span className="text-foreground break-all">
          {log.message ?? ""}
        </span>
      </div>

      {expanded && hasMeta && (
        <div className="ml-8 mr-3 mb-2 p-2 rounded bg-muted/30 border border-border text-xs font-mono">
          {log.request && (
            <div className="mb-1">
              <span className="text-muted-foreground">request: </span>
              <span className="text-foreground">
                {JSON.stringify(log.request, null, 2)}
              </span>
            </div>
          )}
          {log.response && (
            <div>
              <span className="text-muted-foreground">response: </span>
              <span className="text-foreground">
                {JSON.stringify(log.response, null, 2)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────── Main Page ──────────── */

export default function LogsPage() {
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [logs, setLogs] = useState<TaskLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  // Filters
  const [levelFilters, setLevelFilters] = useState<Record<string, boolean>>({
    info: true,
    warn: true,
    error: true,
    debug: false,
    fatal: true,
  });
  const [searchText, setSearchText] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [autoScroll, setAutoScroll] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Fetch tasks list on mount
  useEffect(() => {
    async function fetchTasks() {
      try {
        const res = await fetch("/api/tasks");
        if (!res.ok) return;
        const data = await res.json();
        const options: TaskOption[] = (data.tasks ?? []).map((t: Record<string, unknown>) => ({
          id: t.id as string,
          title: (t.title as string) || (t.id as string).slice(0, 8),
          status: t.status as string,
        }));
        setTasks(options);
      } catch {
        // ignore
      }
    }
    fetchTasks();
  }, []);

  // Fetch historical logs when task changes
  useEffect(() => {
    if (!selectedTaskId) {
      setLogs([]);
      return;
    }

    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      try {
        const res = await fetch(`/api/logs?task_id=${selectedTaskId}&limit=200`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          // API returns newest first, reverse for chronological display
          setLogs((data.logs ?? []).reverse());
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLogs();
    return () => { cancelled = true; };
  }, [selectedTaskId]);

  // Subscribe to realtime broadcast for live tasks
  useEffect(() => {
    if (!selectedTaskId) {
      setSubscribed(false);
      return;
    }

    const selectedTask = tasks.find((t) => t.id === selectedTaskId);
    const isLive = selectedTask?.status === "running";

    if (!isLive) {
      setSubscribed(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`room:task:${selectedTaskId}:logs`)
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const data = payload as { type: string; record: TaskLogRow };
        if (data?.record) {
          setLogs((prev) => {
            const updated = [...prev, data.record];
            return updated.length > MAX_LOGS ? updated.slice(-MAX_LOGS) : updated;
          });
        }
      })
      .on("broadcast", { event: "batch" }, ({ payload }) => {
        const data = payload as { logs: TaskLogRow[] };
        if (data?.logs) {
          setLogs((prev) => {
            const updated = [...prev, ...data.logs];
            return updated.length > MAX_LOGS ? updated.slice(-MAX_LOGS) : updated;
          });
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSubscribed(true);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setSubscribed(false);
    };
  }, [selectedTaskId, tasks]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [logs, autoScroll]);

  // Get unique device serials from logs
  const deviceSerials = useMemo(() => {
    const serials = new Set<string>();
    for (const log of logs) {
      if (log.device_serial) serials.add(log.device_serial);
    }
    return Array.from(serials).sort();
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const level = log.level ?? "info";
      if (!levelFilters[level]) return false;
      if (deviceFilter !== "all" && log.device_serial !== deviceFilter) return false;
      if (searchText && !log.message?.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [logs, levelFilters, deviceFilter, searchText]);

  // Stats
  const stats = useMemo(() => {
    let infoCount = 0, warnCount = 0, errorCount = 0;
    for (const log of logs) {
      const level = log.level ?? "info";
      if (level === "info" || level === "debug") infoCount++;
      else if (level === "warn") warnCount++;
      else if (level === "error" || level === "fatal") errorCount++;
    }
    return { total: logs.length, info: infoCount, warn: warnCount, error: errorCount };
  }, [logs]);

  const toggleLevel = useCallback((level: string) => {
    setLevelFilters((prev) => ({ ...prev, [level]: !prev[level] }));
  }, []);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">로그</h1>
        <p className="text-base text-muted-foreground">
          작업 실행 로그를 실시간으로 확인합니다.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        {/* Task Selector */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">작업</Label>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger className="w-[240px] h-8 text-xs bg-background">
              <SelectValue placeholder="작업을 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {tasks.map((task) => (
                <SelectItem key={task.id} value={task.id} className="text-xs">
                  <span className="truncate">
                    {task.title.length > 30 ? `${task.title.slice(0, 30)}...` : task.title}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-2 text-[10px] px-1 py-0",
                      task.status === "running"
                        ? "border-yellow-500/30 text-yellow-500"
                        : task.status === "completed" || task.status === "done"
                          ? "border-green-500/30 text-green-500"
                          : "border-gray-500/30 text-gray-500"
                    )}
                  >
                    {task.status}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Device Filter */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">기기</Label>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">전체</SelectItem>
              {deviceSerials.map((serial) => (
                <SelectItem key={serial} value={serial} className="text-xs">
                  {serial.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Level Checkboxes */}
        <div className="flex items-center gap-3 border-l border-border pl-3">
          {(["info", "warn", "error", "debug", "fatal"] as const).map((level) => (
            <label
              key={level}
              className="flex items-center gap-1.5 cursor-pointer"
            >
              <Checkbox
                checked={levelFilters[level]}
                onCheckedChange={() => toggleLevel(level)}
                className="h-3.5 w-3.5"
              />
              <span className={cn(
                "text-xs font-mono",
                getLevelConfig(level).color.split(" ").find((c) => c.startsWith("text-"))
              )}>
                {level.toUpperCase()}
              </span>
            </label>
          ))}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-l border-border pl-3">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="메시지 검색..."
            className="h-8 w-[160px] px-2 text-xs rounded-md border border-border bg-background placeholder:text-muted-foreground"
          />
        </div>

        {/* Auto-scroll Toggle */}
        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-xs text-muted-foreground">자동 스크롤</Label>
          <Switch
            checked={autoScroll}
            onCheckedChange={setAutoScroll}
            className="scale-75"
          />
        </div>
      </div>

      {/* Log List */}
      <div className="flex-1 min-h-0 rounded-lg border border-border bg-card overflow-hidden">
        {!selectedTaskId ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-340px)] text-muted-foreground">
            <ScrollText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">작업을 선택하면 로그가 표시됩니다.</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-[calc(100vh-340px)] text-muted-foreground">
            <div className="h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            <span className="ml-2 text-sm">로그를 불러오는 중...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[calc(100vh-340px)] text-muted-foreground">
            <ScrollText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">표시할 로그가 없습니다.</p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-340px)]" ref={scrollRef}>
            <div className="divide-y divide-border/50">
              {filteredLogs.map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center gap-4 px-3 py-2 rounded-lg border border-border bg-card text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2 w-2 rounded-full",
              subscribed
                ? "bg-green-500 animate-pulse"
                : "bg-gray-500"
            )}
          />
          <span>{subscribed ? "실시간 연결됨" : "연결 대기"}</span>
        </div>
        <span className="border-l border-border pl-4">
          전체 {stats.total}건
        </span>
        <span className="text-blue-500">
          정보 {stats.info}
        </span>
        <span className="text-yellow-500">
          경고 {stats.warn}
        </span>
        <span className="text-red-500">
          오류 {stats.error}
        </span>
        {filteredLogs.length !== logs.length && (
          <span className="ml-auto">
            필터 적용: {filteredLogs.length}건 표시 중
          </span>
        )}
      </div>
    </div>
  );
}
