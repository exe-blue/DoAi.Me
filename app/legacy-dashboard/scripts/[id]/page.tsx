"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";

type ScriptDetail = {
  id: string;
  name: string;
  version: number;
  status: string;
  type: string;
  content: string;
  timeout_ms: number;
  params_schema: unknown;
  default_params: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export default function ScriptDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = params?.id as string | undefined;

  const versionParam = searchParams.get("version");
  const version = versionParam ? parseInt(versionParam, 10) : undefined;
  const url =
    id && version
      ? `/api/scripts/${id}?version=${version}`
      : id
        ? `/api/scripts/${id}`
        : null;

  const { data: script, error, isLoading, mutate } = useSWR<ScriptDetail | null>(
    url,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [content, setContent] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(180000);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (script) {
      setContent(script.content);
      setTimeoutMs(script.timeout_ms);
    }
  }, [script]);

  if (!id) {
    return (
      <div className="text-slate-500">Invalid script id.</div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-red-400">
        스크립트를 불러오지 못했습니다.{" "}
        <Link href="/legacy-dashboard/scripts" className="underline">
          목록으로
        </Link>
      </div>
    );
  }
  if (isLoading || !script) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const handleSave = async () => {
    setActionError(null);
    setSaving(true);
    const res = await apiClient.patch(`/api/scripts/${script.id}?version=${script.version}`, {
      body: { content, timeout_ms: timeoutMs },
    });
    setSaving(false);
    if (res.success) mutate();
    else setActionError(res.error ?? "저장 실패");
  };

  const handleNewVersion = async () => {
    setActionError(null);
    const res = await apiClient.post(`/api/scripts/${script.id}/versions`, {});
    if (res.success && res.data) {
      const d = res.data as { id: string; version: number };
      router.push(`/legacy-dashboard/scripts/${d.id}?version=${d.version}`);
      mutate();
    } else setActionError(res.error ?? "버전 생성 실패");
  };

  const handleActivate = async () => {
    setActionError(null);
    const res = await apiClient.post(
      `/api/scripts/${script.id}/activate?version=${script.version}`,
      {}
    );
    if (res.success) mutate();
    else setActionError(res.error ?? "활성화 실패");
  };

  const handleArchive = async () => {
    setActionError(null);
    const res = await apiClient.post(
      `/api/scripts/${script.id}/archive?version=${script.version}`,
      {}
    );
    if (res.success) mutate();
    else setActionError(res.error ?? "아카이브 실패");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href="/legacy-dashboard/scripts"
          className="text-sm text-slate-500 hover:text-white"
        >
          ← 스크립트 목록
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-white">{script.name}</h1>
          <Badge
            variant={script.status === "active" ? "default" : "secondary"}
            className={
              script.status === "active"
                ? "bg-green-600/20 text-green-400 border-green-600/40"
                : ""
            }
          >
            {script.status}
          </Badge>
          <span className="text-slate-500">v{script.version}</span>
          <span className="text-slate-500">{script.type}</span>
        </div>
      </div>

      {actionError && (
        <p className="text-sm text-red-400">{actionError}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleNewVersion}>
          새 버전 만들기
        </Button>
        {script.status !== "active" && (
          <Button
            size="sm"
            variant="outline"
            className="border-green-600/40 text-green-400"
            onClick={handleActivate}
          >
            Activate
          </Button>
        )}
        {script.status !== "archived" && (
          <Button size="sm" variant="outline" onClick={handleArchive}>
            Archive
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">timeout_ms</Label>
        <Input
          type="number"
          min={1000}
          value={timeoutMs}
          onChange={(e) => setTimeoutMs(Number(e.target.value) || 180000)}
          className="border-[#1e2130] bg-[#12141d] text-white w-32"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-slate-300">content</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="font-mono text-sm border-[#1e2130] bg-[#12141d] text-white"
        />
      </div>
    </div>
  );
}
