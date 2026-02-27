"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  Trash2,
  Pencil,
  Zap,
  CalendarClock,
  Loader2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useSchedulesStore, type Schedule } from "@/hooks/use-schedules-store";
import { cronToHumanReadable } from "@/lib/cron-utils";
import { statusBadgeClass, statusTextClass } from "@/components/ui/status-indicator";

/* ──────────── Cron Presets ──────────── */

const CRON_PRESETS = [
  { label: "매 30분", value: "*/30 * * * *" },
  { label: "매 1시간", value: "0 * * * *" },
  { label: "매 2시간", value: "0 */2 * * *" },
  { label: "매 4시간", value: "0 */4 * * *" },
  { label: "매일 9시", value: "0 9 * * *" },
  { label: "매일 9~18시 매시", value: "0 9-18 * * *" },
  { label: "매일 9~18시 30분마다", value: "*/30 9-18 * * *" },
  { label: "평일 9시", value: "0 9 * * 1-5" },
];

/* ──────────── Time Helpers ──────────── */

function formatCountdown(isoDate: string | null): string {
  if (!isoDate) return "-";
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return "곧 실행";
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}시간 ${mins % 60}분 후`;
  return `${mins}분 후`;
}

function formatTimeAgo(isoDate: string | null): string {
  if (!isoDate) return "없음";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/* ──────────── Create/Edit Dialog ──────────── */

function ScheduleDialog({
  open,
  onClose,
  schedule,
}: {
  open: boolean;
  onClose: () => void;
  schedule?: Schedule | null;
}) {
  const { create, update } = useSchedulesStore();
  const isEdit = !!schedule;

  const [name, setName] = useState("");
  const [cronExpr, setCronExpr] = useState("0 */2 * * *");
  const [cronPreview, setCronPreview] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Task config placeholder — in real use, this would be a full task config form
  const [deviceCount, setDeviceCount] = useState(20);

  useEffect(() => {
    if (open) {
      if (schedule) {
        setName(schedule.name);
        setCronExpr(schedule.cron_expression);
        setIsActive(schedule.is_active);
        setDeviceCount(
          (schedule.task_config?.deviceCount as number) ||
            (schedule.task_config?.device_count as number) ||
            20
        );
      } else {
        setName("");
        setCronExpr("0 */2 * * *");
        setIsActive(true);
        setDeviceCount(20);
      }
      setError("");
    }
  }, [open, schedule]);

  // Update cron preview
  useEffect(() => {
    setCronPreview(cronToHumanReadable(cronExpr));
  }, [cronExpr]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("이름을 입력하세요");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const taskConfig = {
        ...(schedule?.task_config ?? {}),
        deviceCount,
      };

      if (isEdit && schedule) {
        await update(schedule.id, {
          name: name.trim(),
          cron_expression: cronExpr,
          task_config: taskConfig,
          is_active: isActive,
        });
      } else {
        await create({
          name: name.trim(),
          cron_expression: cronExpr,
          task_config: taskConfig,
          is_active: isActive,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류 발생");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "스케줄 수정" : "스케줄 생성"}</DialogTitle>
          <DialogDescription>
            크론 표현식으로 자동 반복 실행 일정을 설정합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label className="text-sm">이름</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 채널 A 2시간 로테이션"
              className="mt-1"
            />
          </div>

          {/* Cron Expression */}
          <div>
            <Label className="text-sm">크론 표현식</Label>
            <Input
              value={cronExpr}
              onChange={(e) => setCronExpr(e.target.value)}
              placeholder="0 */2 * * *"
              className="mt-1 font-mono text-sm"
            />
            {cronPreview && (
              <p className="mt-1 text-xs text-muted-foreground">
                미리보기: <span className="font-medium text-foreground">{cronPreview}</span>
              </p>
            )}

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CRON_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setCronExpr(preset.value)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors",
                    cronExpr === preset.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Device Count */}
          <div>
            <Label className="text-sm">기기 수</Label>
            <Input
              type="number"
              value={deviceCount}
              onChange={(e) => setDeviceCount(Number(e.target.value))}
              min={1}
              max={100}
              className="mt-1 w-28"
            />
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            <Label className="text-sm">{isActive ? "활성" : "비활성"}</Label>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                저장 중...
              </>
            ) : isEdit ? (
              "수정"
            ) : (
              "생성"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────── Schedule Card ──────────── */

function ScheduleCard({
  schedule,
  onEdit,
  onTrigger,
  onToggleActive,
  onDelete,
}: {
  schedule: Schedule;
  onEdit: () => void;
  onTrigger: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const humanCron = cronToHumanReadable(schedule.cron_expression);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        schedule.is_active
          ? "border-border hover:border-muted-foreground/20"
          : "border-border/50 opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Name + Active badge */}
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium truncate">{schedule.name}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                schedule.is_active
                  ? statusBadgeClass("success")
                  : statusBadgeClass("neutral")
              )}
            >
              {schedule.is_active ? "활성" : "비활성"}
            </Badge>
          </div>

          {/* Cron info */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">
              {schedule.cron_expression}
            </code>
            <span className="font-medium">{humanCron}</span>
          </div>

          {/* Timing stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {schedule.is_active && schedule.next_run_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                다음 실행: <span className={cn("font-medium", statusTextClass("info"))}>{formatCountdown(schedule.next_run_at)}</span>
              </span>
            )}
            <span className="flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              실행 횟수: {schedule.run_count}회
            </span>
            {schedule.last_run_at && (
              <span>마지막: {formatTimeAgo(schedule.last_run_at)}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2 gap-1"
            onClick={onTrigger}
            title="수동 실행"
          >
            <Zap className="h-3 w-3" />
            실행
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleActive}
            title={schedule.is_active ? "일시정지" : "재개"}
          >
            {schedule.is_active ? (
              <Pause className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <Play className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onEdit}
            title="수정"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ──────────── Main Panel ──────────── */

export function SchedulesPanel() {
  const {
    schedules,
    loading,
    fetch: fetchSchedules,
    remove,
    trigger,
    toggleActive,
  } = useSchedulesStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  useEffect(() => {
    fetchSchedules();
    // Poll every 30s to keep countdowns fresh
    const interval = setInterval(() => fetchSchedules(), 30000);
    return () => clearInterval(interval);
  }, [fetchSchedules]);

  const openCreate = () => {
    setEditingSchedule(null);
    setDialogOpen(true);
  };

  const openEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {schedules.length}개 스케줄 ·{" "}
          {schedules.filter((s) => s.is_active).length}개 활성
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          스케줄 생성
        </Button>
      </div>

      {/* List */}
      {loading && schedules.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CalendarClock className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">등록된 스케줄이 없습니다.</p>
          <p className="text-xs mt-1">크론 표현식으로 자동 반복 실행 일정을 만드세요.</p>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-340px)]">
          <div className="flex flex-col gap-2 pr-3">
            {schedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                onEdit={() => openEdit(schedule)}
                onTrigger={() => trigger(schedule.id)}
                onToggleActive={() => toggleActive(schedule.id)}
                onDelete={() => remove(schedule.id)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Dialog */}
      <ScheduleDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingSchedule(null);
        }}
        schedule={editingSchedule}
      />
    </div>
  );
}
