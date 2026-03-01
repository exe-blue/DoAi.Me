"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  Settings,
  Save,
  Clock,
  Bell,
  Key,
  Trash2,
  Play,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "general", label: "일반", icon: Settings },
  { key: "schedule", label: "스케줄", icon: Clock },
  { key: "alerts", label: "알림", icon: Bell },
  { key: "apikeys", label: "API 키", icon: Key },
] as const;

interface Setting {
  key: string;
  value: string;
  description?: string;
}

interface Schedule {
  id: string;
  name?: string | null;
  cron_expression?: string | null;
  status?: string | null;
  is_active?: boolean;
  task_config?: unknown;
  created_at?: string | null;
}

const GENERAL_KEYS = [
  { k: "heartbeat_interval", label: "하트비트 간격 (ms)", desc: "기기 상태 동기화 주기" },
  { k: "task_poll_interval", label: "태스크 폴링 간격 (ms)", desc: "대기 태스크 확인 주기" },
  { k: "max_concurrent_tasks", label: "최대 동시 태스크", desc: "PC당 동시 실행 수" },
  { k: "max_retry_count", label: "최대 재시도", desc: "실패 시 재시도 횟수" },
  { k: "device_interval", label: "디바이스 간격 (ms)", desc: "기기 간 명령 딜레이" },
  { k: "proxy_check_interval", label: "프록시 체크 간격 (ms)", desc: "프록시 헬스체크 주기" },
  { k: "proxy_policy", label: "프록시 정책", desc: "sticky / rotate_on_failure / rotate_daily" },
  { k: "log_retention_days", label: "로그 보관 (일)", desc: "자동 삭제 기간" },
];

function SettingRow({
  label,
  k,
  edited,
  setEdited,
  desc,
}: {
  label: string;
  k: string;
  edited: Record<string, string>;
  setEdited: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  desc?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <Label className="text-sm">{label}</Label>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      <Input
        value={edited[k] ?? ""}
        onChange={(e) => setEdited((p) => ({ ...p, [k]: e.target.value }))}
        className="w-48 font-mono text-right text-sm"
      />
    </div>
  );
}

function AlertToggle({
  label,
  defaultOn,
}: {
  label: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  );
}

function KeyStatus({ label, set }: { label: string; set?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b py-3">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      {set ? (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          설정됨
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">미설정</span>
      )}
    </div>
  );
}

export function SettingsContent() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { data: settingsData, isLoading: settingsLoading, mutate: mutateSettings } = useSWR<{
    settings: Record<string, { value: unknown; description?: string | null }>;
  }>("/api/settings", fetcher);

  const { data: schedulesData, isLoading: schedulesLoading, mutate: mutateSchedules } = useSWR<{
    schedules: Schedule[];
  }>("/api/schedules", fetcher);

  const settingsRecord = settingsData?.settings ?? {};
  const settingsList: Setting[] = Object.entries(settingsRecord).map(([key, v]) => ({
    key,
    value: typeof v.value === "string" ? v.value : JSON.stringify(v.value ?? ""),
    description: v.description ?? undefined,
  }));

  const schedules = schedulesData?.schedules ?? [];
  const editedMap =
    Object.keys(edited).length > 0
      ? edited
      : Object.fromEntries(settingsList.map((s) => [s.key, s.value ?? ""]));

  const handleSave = useCallback(async () => {
    const body = Object.fromEntries(
      Object.entries(editedMap).filter(([, v]) => v !== undefined)
    );
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    setSaved(false);
    const res = await apiClient.put("/api/settings", { body });
    setSaving(false);
    if (res.success) {
      setSaved(true);
      mutateSettings();
      setTimeout(() => setSaved(false), 3000);
    } else {
      mutateSettings();
    }
  }, [editedMap, mutateSettings]);

  const handleDeleteSchedule = async (id: string) => {
    const res = await apiClient.delete(`/api/schedules/${id}`);
    if (res.success) {
      toast.success("스케줄 삭제됨");
      mutateSchedules();
    } else {
      toast.error(res.error ?? "삭제 실패");
    }
  };

  const handleTrigger = async (id: string) => {
    const res = await apiClient.post(`/api/schedules/${id}/trigger`, { body: {} });
    if (res.success) toast.success("트리거 전송됨");
    else toast.error(res.error ?? "실패");
  };

  const isLoading = settingsLoading || (tab === "schedule" && schedulesLoading);

  return (
    <div className="space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number]["key"])}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {GENERAL_KEYS.map(({ k, label, desc }) => (
                  <SettingRow
                    key={k}
                    label={label}
                    k={k}
                    edited={editedMap}
                    setEdited={setEdited}
                    desc={desc}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                저장됨
              </span>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              저장
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-3">
          {schedulesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">등록된 스케줄 없음</p>
            </div>
          ) : (
            schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-lg border bg-card p-4"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    s.status === "active" || s.is_active ? "bg-green-500/10" : "bg-muted"
                  )}
                >
                  <Clock
                    className={cn(
                      "h-4 w-4",
                      s.status === "active" || s.is_active
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {s.name ?? s.id?.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {s.cron_expression ?? "—"}
                    </span>
                    <span
                      className={
                        s.status === "active" || s.is_active
                          ? "text-green-600 dark:text-green-400"
                          : ""
                      }
                    >
                      {s.status ?? (s.is_active ? "active" : "inactive")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleTrigger(s.id)}
                    title="수동 실행"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteSchedule(s.id)}
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-5">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-xs text-muted-foreground">
              알림 설정 (향후 Slack/Discord 연동)
            </p>
            <div className="mt-4 space-y-4">
              <AlertToggle label="PC Agent 다운 (하트비트 3분 미수신)" defaultOn />
              <AlertToggle label="기기 10대+ 동시 오프라인" />
              <AlertToggle label="미션 실패율 &gt; 20%" />
              <AlertToggle label="계정 밴 5개+ 동시 발생" />
              <AlertToggle label="Supabase 연결 끊김" />
            </div>
            <div className="mt-4 border-t pt-4">
              <Label className="text-xs text-muted-foreground">
                Slack Webhook URL (선택)
              </Label>
              <Input
                placeholder="https://hooks.slack.com/services/..."
                className="mt-1 font-mono text-sm"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="apikeys" className="space-y-5">
          <div className="rounded-lg border bg-card p-5">
            <p className="text-xs text-muted-foreground">
              API 키는 서버 .env 파일에서 관리됩니다. 여기서는 상태만 확인합니다.
            </p>
            <div className="mt-4 space-y-0">
              <KeyStatus label="SUPABASE_URL" set />
              <KeyStatus label="SUPABASE_ANON_KEY" set />
              <KeyStatus label="SUPABASE_SERVICE_ROLE_KEY" set />
              <KeyStatus label="OPENAI_API_KEY" set />
              <KeyStatus label="YOUTUBE_API_KEY" />
              <KeyStatus label="CRON_SECRET" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
