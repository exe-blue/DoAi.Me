"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/api";
import { apiClient } from "@/lib/api";
import type { WorkflowStep, WorkflowOp } from "@/lib/workflow-schema";

type WorkflowDetail = {
  id: string;
  version: number;
  kind: string;
  name: string;
  is_active: boolean;
  steps: WorkflowStep[];
  updated_at: string | null;
};

type ScriptRow = { id: string; name: string; version: number; status: string };

export default function WorkflowEditorPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const versionParam = searchParams.get("version");
  const version = versionParam ? parseInt(versionParam, 10) : undefined;

  const url =
    id && version
      ? `/api/workflows/${encodeURIComponent(id)}?version=${version}`
      : id
        ? `/api/workflows/${encodeURIComponent(id)}`
        : null;

  const { data: workflow, error, isLoading, mutate } = useSWR<WorkflowDetail | null>(
    url,
    fetcher,
    { revalidateOnFocus: false }
  );

  const { data: scriptsData } = useSWR<{ scripts: ScriptRow[] }>(
    "/api/scripts?latestOnly=false",
    fetcher
  );
  const scripts = scriptsData?.scripts ?? [];

  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ error: string; path?: string } | null>(null);

  useEffect(() => {
    if (workflow?.steps && Array.isArray(workflow.steps)) {
      setSteps(workflow.steps as WorkflowStep[]);
    }
  }, [workflow]);

  if (!id) {
    return <div className="text-slate-500">Invalid workflow id.</div>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-red-400">
        워크플로우를 불러오지 못했습니다.{" "}
        <Link href="/legacy-dashboard/workflows" className="underline">
          목록으로
        </Link>
      </div>
    );
  }
  if (isLoading || !workflow) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const backgroundCount = steps.filter((s) => s.lane === "background").length;

  const moveStep = (index: number, dir: "up" | "down") => {
    const next = [...steps];
    const j = dir === "up" ? index - 1 : index + 1;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setSteps(next);
  };

  const updateStep = (index: number, patch: Partial<WorkflowStep>) => {
    const next = [...steps];
    next[index] = { ...next[index], ...patch };
    setSteps(next);
  };

  const updateOp = (
    stepIndex: number,
    opIndex: number,
    patch: Partial<WorkflowOp>
  ) => {
    const next = [...steps];
    const ops = [...(next[stepIndex].ops || [])];
    ops[opIndex] = { ...ops[opIndex], ...patch };
    next[stepIndex] = { ...next[stepIndex], ops };
    setSteps(next);
  };

  const addStep = () => {
    setSteps((s) => [
      ...s,
      {
        id: `step-${Date.now()}`,
        lane: "foreground",
        ops: [
          {
            type: "javascript",
            scriptRef: { scriptId: scripts[0]?.id ?? "", version: scripts[0]?.version ?? 1 },
            params: {},
          },
        ],
      },
    ]);
  };

  const addOp = (stepIndex: number) => {
    const next = [...steps];
    const ops = [...(next[stepIndex].ops || [])];
    ops.push({
      type: "javascript",
      scriptRef: { scriptId: scripts[0]?.id ?? "", version: scripts[0]?.version ?? 1 },
      params: {},
    });
    next[stepIndex] = { ...next[stepIndex], ops };
    setSteps(next);
  };

  const removeStep = (index: number) => {
    setSteps((s) => s.filter((_, i) => i !== index));
  };

  const removeOp = (stepIndex: number, opIndex: number) => {
    const next = [...steps];
    const ops = (next[stepIndex].ops || []).filter((_, i) => i !== opIndex);
    if (ops.length === 0) return;
    next[stepIndex] = { ...next[stepIndex], ops };
    setSteps(next);
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaving(true);
    const res = await apiClient.patch(
      `/api/workflows/${encodeURIComponent(workflow.id)}?version=${workflow.version}`,
      { body: { steps }, silent: true }
    );
    setSaving(false);
    if (res.success) mutate();
    else
      setSaveError({
        error: (res as { error?: string }).error ?? "저장 실패",
        path: (res as { path?: string }).path,
      });
  };

  const handleNewVersion = async () => {
    setSaveError(null);
    const res = await apiClient.post(
      `/api/workflows/${encodeURIComponent(workflow.id)}/versions`,
      {}
    );
    if (res.success && res.data) {
      const d = res.data as { id: string; version: number };
      window.location.href = `/legacy-dashboard/workflows/${encodeURIComponent(d.id)}?version=${d.version}`;
    } else
      setSaveError({
        error: (res as { error?: string }).error ?? "버전 생성 실패",
      });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/legacy-dashboard/workflows"
          className="text-sm text-slate-500 hover:text-white"
        >
          ← 워크플로우 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{workflow.name || workflow.id}</h1>
          <span className="text-slate-500">v{workflow.version}</span>
          <span className="text-slate-500">{workflow.kind}</span>
        </div>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-400">
          {saveError.error}
          {saveError.path && (
            <span className="ml-2 text-slate-500">(path: {saveError.path})</span>
          )}
        </div>
      )}

      {backgroundCount > 1 && (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-400">
          background step은 최대 1개만 허용됩니다. 저장 시 서버에서 400이 반환됩니다.
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>
        <Button variant="outline" onClick={handleNewVersion}>
          새 버전 만들기 (복사)
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-slate-300">steps</Label>
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            + step 추가
          </Button>
        </div>

        {steps.map((step, stepIndex) => (
          <div
            key={step.id}
            className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4 space-y-3"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => moveStep(stepIndex, "up")}
                disabled={stepIndex === 0}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => moveStep(stepIndex, "down")}
                disabled={stepIndex === steps.length - 1}
              >
                ↓
              </Button>
              <Input
                placeholder="step id"
                value={step.id}
                onChange={(e) => updateStep(stepIndex, { id: e.target.value })}
                className="w-40 border-[#1e2130] bg-[#0d0e14] text-white font-mono text-sm"
              />
              <Select
                value={step.lane}
                onValueChange={(v) =>
                  updateStep(stepIndex, {
                    lane: v as "foreground" | "background",
                  })
                }
              >
                <SelectTrigger className="w-32 border-[#1e2130] bg-[#0d0e14] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foreground">foreground</SelectItem>
                  <SelectItem value="background">background</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                placeholder="waitBefore"
                value={step.waitSecBefore ?? ""}
                onChange={(e) =>
                  updateStep(stepIndex, {
                    waitSecBefore: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-24 border-[#1e2130] bg-[#0d0e14] text-white"
              />
              <Input
                type="number"
                min={0}
                placeholder="waitAfter"
                value={step.waitSecAfter ?? ""}
                onChange={(e) =>
                  updateStep(stepIndex, {
                    waitSecAfter: e.target.value === "" ? undefined : Number(e.target.value),
                  })
                }
                className="w-24 border-[#1e2130] bg-[#0d0e14] text-white"
              />
              <label className="flex items-center gap-1 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={step.continueOnError ?? false}
                  onChange={(e) =>
                    updateStep(stepIndex, { continueOnError: e.target.checked })
                  }
                  className="rounded border-[#1e2130]"
                />
                continueOnError
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeStep(stepIndex)}
                disabled={steps.length <= 1}
                className="text-red-400"
              >
                삭제
              </Button>
            </div>

            <div className="pl-4 border-l-2 border-[#1e2130] space-y-2">
              {(step.ops || []).map((op, opIndex) => (
                <div
                  key={opIndex}
                  className="flex flex-wrap items-start gap-2 rounded-lg bg-[#0d0e14] p-3"
                >
                  <Select
                    value={
                      op.scriptRef?.scriptId && op.scriptRef?.version != null
                        ? `${op.scriptRef.scriptId}@${op.scriptRef.version}`
                        : ""
                    }
                    onValueChange={(v) => {
                      const [scriptId, ver] = v.split("@");
                      updateOp(stepIndex, opIndex, {
                        scriptRef: {
                          scriptId: scriptId ?? "",
                          version: parseInt(ver ?? "1", 10),
                        },
                      });
                    }}
                  >
                    <SelectTrigger className="w-[260px] border-[#1e2130] bg-[#12141d] text-white">
                      <SelectValue placeholder="스크립트 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {scripts.map((s) => (
                        <SelectItem
                          key={`${s.id}-${s.version}`}
                          value={`${s.id}@${s.version}`}
                        >
                          {s.name} v{s.version} ({s.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    placeholder="timeoutMs"
                    value={op.timeoutMs ?? ""}
                    onChange={(e) =>
                      updateOp(stepIndex, opIndex, {
                        timeoutMs:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                    className="w-24 border-[#1e2130] bg-[#12141d] text-white"
                  />
                  <div className="flex-1 min-w-[120px]">
                    <Input
                      placeholder="params JSON"
                      value={JSON.stringify(op.params ?? {})}
                      onChange={(e) => {
                        try {
                          const params = JSON.parse(e.target.value || "{}");
                          if (typeof params === "object" && params !== null)
                            updateOp(stepIndex, opIndex, { params });
                        } catch {
                          // ignore invalid JSON while typing
                        }
                      }}
                      className="font-mono text-xs border-[#1e2130] bg-[#12141d] text-white"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeOp(stepIndex, opIndex)}
                    disabled={(step.ops?.length ?? 0) <= 1}
                    className="text-red-400"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addOp(stepIndex)}
              >
                + op 추가
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
