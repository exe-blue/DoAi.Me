"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Filter,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { LogEntry, LogLevel } from "@/lib/types";

function getLogIcon(level: LogLevel) {
  switch (level) {
    case "info":
      return <Info className="h-3.5 w-3.5 text-blue-400" />;
    case "warn":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    case "debug":
      return <Bug className="h-3.5 w-3.5 text-zinc-400" />;
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  }
}

function getLogColor(level: LogLevel) {
  switch (level) {
    case "info":
      return "text-blue-400";
    case "warn":
      return "text-amber-400";
    case "error":
      return "text-red-400";
    case "debug":
      return "text-zinc-400";
    case "success":
      return "text-emerald-400";
  }
}

function getLogBadgeColor(level: LogLevel) {
  switch (level) {
    case "info":
      return "border-blue-500/30 text-blue-400";
    case "warn":
      return "border-amber-500/30 text-amber-400";
    case "error":
      return "border-red-500/30 text-red-400";
    case "debug":
      return "border-zinc-500/30 text-zinc-400";
    case "success":
      return "border-emerald-500/30 text-emerald-400";
  }
}

const LOG_LEVELS: LogLevel[] = ["info", "warn", "error", "debug", "success"];
const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
  debug: "DEBUG",
  success: "SUCCESS",
};

export function LogsPage({ logs }: { logs: LogEntry[] }) {
  const [search, setSearch] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<LogLevel>>(
    new Set(LOG_LEVELS),
  );
  const [nodeFilter, setNodeFilter] = useState<string>("all");

  const toggleLevel = (level: LogLevel) => {
    const newSet = new Set(selectedLevels);
    if (newSet.has(level)) {
      newSet.delete(level);
    } else {
      newSet.add(level);
    }
    setSelectedLevels(newSet);
  };

  const filteredLogs = useMemo(() => {
    return logs
      .filter((log) => {
        if (!selectedLevels.has(log.level)) return false;
        if (nodeFilter !== "all" && log.nodeId !== nodeFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return (
            log.message.toLowerCase().includes(q) ||
            log.source.toLowerCase().includes(q) ||
            (log.deviceId && log.deviceId.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
  }, [logs, selectedLevels, nodeFilter, search]);

  const logStats = useMemo(() => {
    const s: Record<string, number> = {};
    for (const l of LOG_LEVELS) s[l] = 0;
    for (const log of logs) s[log.level]++;
    return s;
  }, [logs]);

  const nodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) set.add(log.nodeId);
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">실행내역</h1>
        <p className="text-sm text-muted-foreground">
          전체 시스템 로그를 레벨별로 확인합니다.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {LOG_LEVELS.map((level) => (
            <Button
              key={level}
              variant={selectedLevels.has(level) ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-7 text-xs px-2.5",
                selectedLevels.has(level)
                  ? ""
                  : "opacity-50",
              )}
              onClick={() => toggleLevel(level)}
            >
              {getLogIcon(level)}
              <span className="ml-1">{LOG_LEVEL_LABELS[level]}</span>
              <span className="ml-1 font-mono">{logStats[level]}</span>
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="메시지, 소스, 디바이스 ID 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-secondary"
            />
          </div>
          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground"
          >
            <option value="all">전체 노드</option>
            {nodeIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Log List */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        <div className="flex flex-col gap-0.5 pr-3">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className={cn(
                "flex items-start gap-2 rounded px-2 py-1.5 font-mono text-xs transition-colors hover:bg-secondary/80",
                log.level === "error" && "bg-red-500/5",
                log.level === "warn" && "bg-amber-500/5",
              )}
            >
              <span className="shrink-0 text-[11px] text-muted-foreground w-36">
                {new Date(log.timestamp).toLocaleString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[10px] w-16 justify-center",
                  getLogBadgeColor(log.level),
                )}
              >
                {LOG_LEVEL_LABELS[log.level]}
              </Badge>
              <span className="shrink-0 text-[11px] text-muted-foreground w-12">
                {log.nodeId}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground w-12">
                {log.deviceId || "-"}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground/70 w-24 truncate">
                {log.source}
              </span>
              <span className={cn("flex-1 text-xs", getLogColor(log.level))}>
                {log.message}
              </span>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              필터 조건에 맞는 로그가 없습니다.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
