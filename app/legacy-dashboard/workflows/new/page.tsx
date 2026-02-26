"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { fetcher } from "@/lib/api";
import type { WorkflowStep } from "@/lib/workflow-schema";

type ScriptRow = { id: string; name: string; version: number; status: string };

function defaultStep(i: number, scriptId: string, version: number): WorkflowStep {
  return {
    id: `step-${i + 1}`,
    lane: "foreground",
    ops: [
      {
        type: "javascript",
        scriptRef: { scriptId: scriptId || "", version: version || 1 },
        params: {},
      },
    ],
  };
}

export default function NewWorkflowPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("MAIN");
  const [firstScriptId, setFirstScriptId] = useState("");
  const [firstScriptVersion, setFirstScriptVersion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ error: string; path?: string } | null>(null);

  const { data: scriptsData } = useSWR<{ scripts: ScriptRow[] }>(
    "/api/scripts?latestOnly=true",
    fetcher
  );
  const scripts = scriptsData?.scripts ?? [];
  useEffect(() => {
    if (scripts.length > 0 && !firstScriptId) {
      setFirstScriptId(scripts[0].id);
      setFirstScriptVersion(scripts[0].version);
    }
  }, [scripts, firstScriptId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstScriptId?.trim()) {
      setError({ error: "스크립트를 선택하세요" });
      return;
    }
    const steps: WorkflowStep[] = [
      defaultStep(0, firstScriptId, firstScriptVersion),
    ];
    setSaving(true);
    const res = await apiClient.post("/api/workflows", {
      body: { id: id.trim(), name: name.trim() || id.trim(), kind, steps },
      silent: true,
    });
    setSaving(false);
    if (res.success && res.data) {
      const d = res.data as { id: string; version: number };
      router.push(
        `/legacy-dashboard/workflows/${encodeURIComponent(d.id)}?version=${d.version}`
      );
      return;
    }
    setError({
      error: (res as { error?: string }).error ?? "저장 실패",
      path: (res as { path?: string }).path,
    });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/legacy-dashboard/workflows"
          className="text-sm text-slate-500 hover:text-white"
        >
          ← 워크플로우 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">새 워크플로우</h1>
        <p className="text-sm text-slate-500">
          version=1 · steps는 저장 시 validateWorkflowSteps 검증
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-[#1e2130] bg-[#12141d] p-6"
      >
        {error && (
          <div className="text-sm text-red-400">
            {error.error}
            {error.path && (
              <span className="text-slate-500"> (path: {error.path})</span>
            )}
          </div>
        )}
        <div>
          <Label className="text-slate-300">id</Label>
          <Input
            required
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="예: WATCH_MAIN"
            className="mt-1 border-[#1e2130] bg-[#0d0e14] text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="표시 이름"
            className="mt-1 border-[#1e2130] bg-[#0d0e14] text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">kind</Label>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="mt-1 w-32 border-[#1e2130] bg-[#0d0e14] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MAIN">MAIN</SelectItem>
              <SelectItem value="MAINTENANCE">MAINTENANCE</SelectItem>
              <SelectItem value="EVENT">EVENT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300">첫 step 스크립트</Label>
          <p className="mt-1 text-xs text-slate-500">
            생성 후 편집 페이지에서 step/op 추가·수정
          </p>
          {scripts.length === 0 ? (
            <p className="mt-2 text-sm text-amber-500">
              스크립트가 없습니다.{" "}
              <Link href="/dashboard/scripts/new" className="underline">
                스크립트 등록
              </Link>
            </p>
          ) : (
            <div className="mt-2 flex gap-2">
              <Select
                value={firstScriptId}
                onValueChange={(v) => {
                  setFirstScriptId(v);
                  const s = scripts.find((x) => x.id === v);
                  if (s) setFirstScriptVersion(s.version);
                }}
              >
                <SelectTrigger className="w-[280px] border-[#1e2130] bg-[#0d0e14] text-white">
                  <SelectValue placeholder="스크립트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {scripts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} (v{s.version}, {s.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={1}
                value={firstScriptVersion}
                onChange={(e) =>
                  setFirstScriptVersion(Number(e.target.value) || 1)
                }
                className="w-20 border-[#1e2130] bg-[#0d0e14] text-white"
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={saving || scripts.length === 0}
          >
            {saving ? "저장 중…" : "생성"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/legacy-dashboard/workflows">취소</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
