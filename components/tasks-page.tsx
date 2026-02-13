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
import { cn } from "@/lib/utils";
import type { Task, NodePC, TaskStatus, TaskVariables } from "@/lib/types";
import { statusTextClass, statusBadgeClass, statusDotClass } from "@/components/ui/status-indicator";

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

/* ──────────── Variable Registration Dialog ──────────── */

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

/* ──────────── Register Task Dialog ──────────── */

function RegisterTaskDialog({
  open,
  onClose,
  nodes,
}: {
  open: boolean;
  onClose: () => void;
  nodes: NodePC[];
}) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-base">작업 등록</DialogTitle>
          <DialogDescription className="text-sm">
            새 작업을 등록합니다. 기본값은 전체 기기 선택입니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-3 rounded-md border border-border">
            <span className="text-sm">전체 기기 선택</span>
            <Button
              size="sm"
              variant={selectAll ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setSelectAll(!selectAll)}
            >
              {selectAll ? (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  선택됨
                </>
              ) : (
                "선택"
              )}
            </Button>
          </div>

          {!selectAll && (
            <ScrollArea className="h-52">
              <div className="flex flex-col gap-1.5 pr-3">
                {nodes.map((node) => (
                  <div
                    key={node.id}
                    className="rounded border border-border p-2.5"
                  >
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full text-left"
                      onClick={() =>
                        setExpandedNode(
                          expandedNode === node.id ? null : node.id,
                        )
                      }
                    >
                      {expandedNode === node.id ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="text-sm">{node.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({node.devices.length}대)
                      </span>
                    </button>
                    {expandedNode === node.id && (
                      <div className="grid grid-cols-10 gap-1 mt-2">
                        {node.devices.slice(0, 20).map((d, idx) => (
                          <button
                            type="button"
                            key={d.id}
                            className="rounded border border-border bg-secondary p-1 text-[10px] font-mono text-muted-foreground hover:border-primary transition-colors"
                          >
                            {idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onClose}>작업 등록</Button>
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
  const [variableOpen, setVariableOpen] = useState(false);

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
            트리거에 따라 자동 진행되는 작업을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            onClick={() => setVariableOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5 mr-1.5" />
            변수 등록
          </Button>
          <Button size="sm" onClick={() => setRegisterOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            작업 등록
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
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

        <div className="ml-auto text-xs text-muted-foreground">
          병렬 20대 기기 제한 / 한 번에 1작업 실행
        </div>
      </div>

      {loading && tasks.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">작업 목록을 불러오는 중...</span>
        </div>
      )}

      <ScrollArea className="h-[calc(100vh-260px)]">
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

      <TaskLogDialog
        open={!!logTask}
        onClose={() => setLogTask(null)}
        task={logTask}
      />
      <RegisterTaskDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        nodes={nodes}
      />
      <VariableDialog
        open={variableOpen}
        onClose={() => setVariableOpen(false)}
      />
    </div>
  );
}
