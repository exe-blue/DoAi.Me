"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  Settings,
  RefreshCw,
  Save,
  Clock,
  Bell,
  Key,
  Plus,
  Trash2,
  Play,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

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
  name?: string;
  cron?: string;
  status?: string;
  task_config?: unknown;
  created_at?: string;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { data: settingsData, isLoading: settingsLoading, mutate: mutateSettings } = useSWR<Setting[]>(
    "/api/settings",
    fetcher
  );
  const { data: schedulesData, isLoading: schedulesLoading, mutate: mutateSchedules } = useSWR<Schedule[]>(
    "/api/schedules",
    fetcher
  );

  const settingsList = Array.isArray(settingsData) ? settingsData : (settingsData as { settings?: Setting[] })?.settings ?? [];
  const schedules = Array.isArray(schedulesData) ? schedulesData : (schedulesData as { schedules?: Schedule[] })?.schedules ?? [];

  const editedMap = Object.keys(edited).length > 0 ? edited : Object.fromEntries(
    settingsList.map((s) => [s.key, s.value ?? ""])
  );

  const handleSave = useCallback(async () => {
    const entries = Object.entries(editedMap).map(([key, value]) => ({ key, value }));
    const prev = Object.fromEntries(settingsList.map((s) => [s.key, s.value ?? ""]));
    setEdited(editedMap);
    mutateSettings(
      (current) => (Array.isArray(current) ? current.map((s) => ({ ...s, value: editedMap[s.key] ?? s.value })) : current),
      false
    );
    setSaving(true);
    setSaved(false);
    const res = await apiClient.put("/api/settings", {
      body: { settings: entries },
    });
    setSaving(false);
    if (res.success) {
      setSaved(true);
      mutateSettings();
      setTimeout(() => setSaved(false), 3000);
    } else {
      mutateSettings(prev as unknown as Promise<Setting[]>, false);
      setEdited(prev);
    }
  }, [editedMap, settingsList, mutateSettings]);

  const handleDeleteSchedule = async (id: string) => {
    const res = await apiClient.delete(`/api/schedules/${id}`);
    if (res.success) {
      toast.success("스케줄 삭제됨");
      mutateSchedules();
    }
  };

  const handleTrigger = async (id: string) => {
    const res = await apiClient.post(`/api/schedules/${id}/trigger`, { body: {} });
    if (res.success) toast.success("트리거 전송됨");
  };

  const isLoading = settingsLoading || (tab === "schedule" && schedulesLoading);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">설정</h1>

      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium transition-colors",
                tab === t.key ? "bg-[#1a1d2e] text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <div className="space-y-4">
          <div className="space-y-4 rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <SettingRow
                  label="하트비트 간격 (ms)"
                  k="heartbeat_interval"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="기기 상태 동기화 주기"
                />
                <SettingRow
                  label="태스크 폴링 간격 (ms)"
                  k="task_poll_interval"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="대기 태스크 확인 주기"
                />
                <SettingRow
                  label="최대 동시 태스크"
                  k="max_concurrent_tasks"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="PC당 동시 실행 수"
                />
                <SettingRow
                  label="최대 재시도"
                  k="max_retry_count"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="실패 시 재시도 횟수"
                />
                <SettingRow
                  label="디바이스 간격 (ms)"
                  k="device_interval"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="기기 간 명령 딜레이"
                />
                <SettingRow
                  label="프록시 체크 간격 (ms)"
                  k="proxy_check_interval"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="프록시 헬스체크 주기"
                />
                <SettingRow
                  label="프록시 정책"
                  k="proxy_policy"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="sticky / rotate_on_failure / rotate_daily"
                />
                <SettingRow
                  label="로그 보관 (일)"
                  k="log_retention_days"
                  edited={editedMap}
                  setEdited={setEdited}
                  desc="자동 삭제 기간"
                />
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            {saved && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                저장됨
              </span>
            )}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              저장
            </Button>
          </div>
        </div>
      )}

      {tab === "schedule" && (
        <div className="space-y-3">
          {schedulesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
              <Clock className="mx-auto h-8 w-8 text-slate-600" />
              <p className="mt-3 text-sm text-slate-500">등록된 스케줄 없음</p>
            </div>
          ) : (
            schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-xl border border-[#1e2130] bg-[#12141d] p-4"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    s.status === "active" ? "bg-green-900/20" : "bg-slate-800"
                  )}
                >
                  <Clock
                    className={cn(
                      "h-4 w-4",
                      s.status === "active" ? "text-green-400" : "text-slate-500"
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">
                    {s.name ?? s.id?.slice(0, 8)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-mono">{s.cron ?? "—"}</span>
                    <span
                      className={
                        s.status === "active" ? "text-green-400" : "text-slate-500"
                      }
                    >
                      {s.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleTrigger(s.id)}
                    className="rounded-lg border border-[#1e2130] bg-[#0d1117] p-1.5 text-primary hover:bg-primary/5"
                    title="수동 실행"
                    aria-label="수동 실행"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSchedule(s.id)}
                    className="rounded-lg border border-[#1e2130] bg-[#0d1117] p-1.5 text-red-400 hover:bg-red-900/10"
                    title="삭제"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-5 rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <p className="text-xs text-slate-500">
            알림 설정 (향후 Slack/Discord 연동)
          </p>
          <AlertToggle label="PC Agent 다운 (하트비트 3분 미수신)" defaultOn />
          <AlertToggle label="기기 10대+ 동시 오프라인" />
          <AlertToggle label="미션 실패율 &gt; 20%" />
          <AlertToggle label="계정 밴 5개+ 동시 발생" />
          <AlertToggle label="Supabase 연결 끊김" />
          <div className="border-t border-[#1e2130] pt-2">
            <Label className="text-xs text-slate-400">Slack Webhook URL (선택)</Label>
            <Input
              placeholder="https://hooks.slack.com/services/..."
              className="mt-1 font-mono text-sm text-slate-300 border-[#1e2130] bg-[#0d1117]"
            />
          </div>
        </div>
      )}

      {tab === "apikeys" && (
        <div className="space-y-5 rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <p className="text-xs text-slate-500">
            API 키는 서버 .env 파일에서 관리됩니다. 여기서는 상태만 확인합니다.
          </p>
          <KeyStatus label="SUPABASE_URL" set />
          <KeyStatus label="SUPABASE_ANON_KEY" set />
          <KeyStatus label="SUPABASE_SERVICE_ROLE_KEY" set />
          <KeyStatus label="OPENAI_API_KEY" set />
          <KeyStatus label="YOUTUBE_API_KEY" />
          <KeyStatus label="CRON_SECRET" />
        </div>
      )}
    </div>
  );
}

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
        <Label className="text-sm text-slate-300">{label}</Label>
        {desc && <p className="text-[10px] text-slate-600">{desc}</p>}
      </div>
      <Input
        value={edited[k] ?? ""}
        onChange={(e) =>
          setEdited((p) => ({ ...p, [k]: e.target.value }))
        }
        className="w-48 border-[#1e2130] bg-[#0d1117] font-mono text-right text-sm text-slate-300"
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
      <span className="text-sm text-slate-300">{label}</span>
      <Switch checked={on} onCheckedChange={setOn} />
    </div>
  );
}

function KeyStatus({ label, set }: { label: string; set?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[#1e2130] pb-3">
      <span className="font-mono text-xs text-slate-400">{label}</span>
      {set ? (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle2 className="h-3 w-3" />
          설정됨
        </span>
      ) : (
        <span className="text-xs text-slate-600">미설정</span>
      )}
    </div>
  );
}
