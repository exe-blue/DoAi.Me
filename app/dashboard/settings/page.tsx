"use client";

import { useEffect, useState, useCallback } from "react";
import { useSettingsStore } from "@/hooks/use-settings-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, Timer, Wifi, Shield, Database, Save, Loader2 } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type: "number" | "range" | "radio";
  min?: number;
  max?: number;
  unit?: string;
  helper?: (v: number) => string;
  options?: Array<{ value: string; label: string; description: string }>;
}

// ── Validation ───────────────────────────────────────────────────

function validateField(def: FieldDef, value: unknown): string | null {
  if (def.type === "number") {
    const n = Number(value);
    if (isNaN(n)) return "숫자를 입력하세요";
    if (def.min !== undefined && n < def.min) return `최소값: ${def.min}`;
    if (def.max !== undefined && n > def.max) return `최대값: ${def.max}`;
  }
  if (def.type === "range") {
    const arr = value as [number, number];
    if (!Array.isArray(arr) || arr.length !== 2) return "범위 값을 입력하세요";
    if (isNaN(arr[0]) || isNaN(arr[1])) return "숫자를 입력하세요";
    if (def.min !== undefined && arr[0] < def.min) return `최소값: ${def.min}`;
    if (def.max !== undefined && arr[1] > def.max) return `최대값: ${def.max}`;
    if (arr[0] >= arr[1]) return "최소값이 최대값보다 작아야 합니다";
  }
  return null;
}

// ── Field Definitions ────────────────────────────────────────────

const TASK_FIELDS: FieldDef[] = [
  { key: "watch_duration", label: "시청 시간 (초)", type: "range", min: 10, max: 600, unit: "초" },
  { key: "task_interval", label: "태스크 간격 (ms)", type: "range", min: 100, max: 60000, unit: "ms" },
  { key: "device_interval", label: "디바이스 간격 (ms)", type: "number", min: 100, max: 10000, unit: "ms" },
  { key: "max_concurrent_tasks", label: "최대 동시 태스크", type: "number", min: 1, max: 20 },
  { key: "max_retry_count", label: "최대 재시도 횟수", type: "number", min: 0, max: 10 },
];

const AGENT_FIELDS: FieldDef[] = [
  { key: "heartbeat_interval", label: "Heartbeat 주기", type: "number", min: 5000, max: 120000, unit: "ms", helper: (v) => `= ${(v / 1000).toFixed(1)}초` },
  { key: "adb_reconnect_interval", label: "ADB 재연결 주기", type: "number", min: 10000, max: 300000, unit: "ms", helper: (v) => `= ${(v / 1000).toFixed(0)}초` },
  { key: "proxy_check_interval", label: "프록시 검증 주기", type: "number", min: 60000, max: 86400000, unit: "ms", helper: (v) => v >= 3600000 ? `= ${(v / 3600000).toFixed(1)}시간` : `= ${(v / 60000).toFixed(0)}분` },
];

const PROXY_POLICY_OPTIONS = [
  { value: "sticky", label: "Sticky", description: "수동으로 변경할 때까지 같은 프록시 유지" },
  { value: "rotate_on_failure", label: "Rotate on Failure", description: "실패 3회 시 자동으로 새 프록시로 교체" },
  { value: "rotate_daily", label: "Rotate Daily", description: "매일 모든 프록시 할당을 랜덤 셔플" },
];

const RETENTION_FIELDS: FieldDef[] = [
  { key: "log_retention_days", label: "태스크 로그 보관", type: "number", min: 1, max: 90, unit: "일" },
  { key: "command_log_retention_days", label: "명령 로그 보관", type: "number", min: 1, max: 365, unit: "일" },
];

// ── Component ────────────────────────────────────────────────────

export default function SettingsPage() {
  const { settings, loading, saving, fetch: fetchSettings, save } = useSettingsStore();
  const getValue = useSettingsStore((s) => s.getValue);

  // Local form state (draft values)
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  // Load settings on mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync draft from settings when loaded
  useEffect(() => {
    if (Object.keys(settings).length > 0) {
      const initial: Record<string, unknown> = {};
      for (const key of Object.keys(settings)) {
        initial[key] = settings[key].value;
      }
      setDraft(initial);
      setDirty(false);
    }
  }, [settings]);

  const getDraftValue = useCallback(
    <T,>(key: string, fallback: T): T => {
      const val = draft[key];
      return val !== undefined ? (val as T) : fallback;
    },
    [draft]
  );

  const updateDraft = useCallback((key: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleSave = async () => {
    // Validate all fields
    const allFields = [...TASK_FIELDS, ...AGENT_FIELDS, ...RETENTION_FIELDS];
    const newErrors: Record<string, string> = {};

    for (const field of allFields) {
      const val = draft[field.key];
      const err = validateField(field, val);
      if (err) newErrors[field.key] = err;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Build changed values only
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(draft)) {
      const original = settings[key]?.value;
      if (JSON.stringify(val) !== JSON.stringify(original)) {
        updates[key] = val;
      }
    }

    if (Object.keys(updates).length === 0) {
      setDirty(false);
      return;
    }

    try {
      await save(updates);
      setDirty(false);
    } catch {
      // Toast already shown
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-1">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">설정</h1>
          <p className="text-base text-muted-foreground">시스템 설정을 관리합니다.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              로딩 중...
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">설정</h1>
          <p className="text-base text-muted-foreground">Agent 실행 파라미터 및 프록시 정책을 관리합니다.</p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* Section 1: Task Execution */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">태스크 실행</CardTitle>
          </div>
          <CardDescription>시청 시간, 간격, 동시 실행 수 등 태스크 실행 파라미터</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {TASK_FIELDS.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={getDraftValue(field.key, field.type === "range" ? [0, 0] : 0)}
              error={errors[field.key]}
              updatedAt={settings[field.key]?.updated_at}
              onChange={(v) => updateDraft(field.key, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Section 2: Agent Intervals */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Agent 주기</CardTitle>
          </div>
          <CardDescription>Heartbeat, ADB 재연결, 프록시 검증 주기 설정</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {AGENT_FIELDS.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={getDraftValue(field.key, 0)}
              error={errors[field.key]}
              updatedAt={settings[field.key]?.updated_at}
              onChange={(v) => updateDraft(field.key, v)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Section 3: Proxy Policy */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">프록시 정책</CardTitle>
          </div>
          <CardDescription>프록시 자동 교체 정책을 선택합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={getDraftValue<string>("proxy_policy", "sticky")}
            onValueChange={(v) => updateDraft("proxy_policy", v)}
            className="space-y-3"
          >
            {PROXY_POLICY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
              >
                <RadioGroupItem value={opt.value} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                </div>
              </label>
            ))}
          </RadioGroup>
          {settings.proxy_policy?.updated_at && (
            <p className="text-xs text-muted-foreground mt-3">
              마지막 수정: {new Date(settings.proxy_policy.updated_at).toLocaleString("ko-KR")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Data Retention */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">데이터 보관</CardTitle>
          </div>
          <CardDescription>로그 데이터 자동 삭제 기간을 설정합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {RETENTION_FIELDS.map((field) => (
            <SettingField
              key={field.key}
              field={field}
              value={getDraftValue(field.key, 0)}
              error={errors[field.key]}
              updatedAt={settings[field.key]?.updated_at}
              onChange={(v) => updateDraft(field.key, v)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ── SettingField Component ───────────────────────────────────────

function SettingField({
  field,
  value,
  error,
  updatedAt,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  updatedAt?: string | null;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "range") {
    const arr = Array.isArray(value) ? value : [0, 0];
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-sm font-medium">{field.label}</Label>
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(updatedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={arr[0] ?? ""}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange([Number(e.target.value), arr[1]])}
            className="w-28 font-mono text-sm"
            placeholder="최소"
          />
          <span className="text-muted-foreground text-sm">~</span>
          <Input
            type="number"
            value={arr[1] ?? ""}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange([arr[0], Number(e.target.value)])}
            className="w-28 font-mono text-sm"
            placeholder="최대"
          />
          {field.unit && <Badge variant="secondary" className="text-xs">{field.unit}</Badge>}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  if (field.type === "number") {
    const num = typeof value === "number" ? value : 0;
    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-sm font-medium">{field.label}</Label>
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              {new Date(updatedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={num}
            min={field.min}
            max={field.max}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-36 font-mono text-sm"
          />
          {field.unit && <Badge variant="secondary" className="text-xs">{field.unit}</Badge>}
          {field.helper && (
            <span className="text-xs text-muted-foreground">{field.helper(num)}</span>
          )}
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
    );
  }

  return null;
}
