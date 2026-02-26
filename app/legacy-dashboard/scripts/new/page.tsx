"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import {
  validateScriptName,
  allowedScriptPrefixes,
  type AllowedPrefix,
} from "@/lib/validate-script-name";

export default function NewScriptPage() {
  const router = useRouter();
  const [prefix, setPrefix] = useState<AllowedPrefix>("yt");
  const [path, setPath] = useState("");
  const [type, setType] = useState<"javascript" | "adb_shell">("javascript");
  const [content, setContent] = useState(
    "export default async function(ctx, params) {\n  if (ctx?.log) ctx.log('run');\n}",
  );
  const [timeoutMs, setTimeoutMs] = useState(180000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullName = useMemo(
    () => (path.trim() ? `${prefix}/${path.trim()}` : ""),
    [prefix, path],
  );
  const nameValidation = useMemo(
    () =>
      fullName
        ? validateScriptName(fullName)
        : { ok: false as const, error: "path is required" },
    [fullName],
  );
  const isNameValid = nameValidation.ok;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isNameValid) return;
    setSaving(true);
    const res = await apiClient.post("/api/scripts", {
      body: { name: fullName, type, content, timeout_ms: timeoutMs },
    });
    setSaving(false);
    if (res.success && res.data) {
      const d = res.data as { id: string; version: number };
      router.push(`/legacy-dashboard/scripts/${d.id}?version=${d.version}`);
      return;
    }
    setError(res.error ?? "저장 실패");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href="/legacy-dashboard/scripts"
          className="text-sm text-slate-500 hover:text-white"
        >
          ← 스크립트 목록
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">새 스크립트</h1>
        <p className="text-sm text-slate-500">
          version=1, status=draft · 이름은 prefix + 경로 (예: yt/preflight,
          device/adb/restart)
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-[#1e2130] bg-[#12141d] p-6"
      >
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div>
          <Label className="text-slate-300">이름 (prefix + 경로)</Label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Select
              value={prefix}
              onValueChange={(v) => setPrefix(v as AllowedPrefix)}
            >
              <SelectTrigger className="w-[120px] border-[#1e2130] bg-[#0d0e14] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedScriptPrefixes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}/
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-slate-500">/</span>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="preflight 또는 adb/restart"
              className="flex-1 min-w-[160px] border-[#1e2130] bg-[#0d0e14] text-white font-mono"
            />
          </div>
          {fullName && (
            <p className="mt-1 text-xs text-slate-500 font-mono">
              → {fullName}
            </p>
          )}
          {!isNameValid && fullName && (
            <p className="mt-1 text-sm text-red-400">{nameValidation.error}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            허용 prefix: yt, device, ops. 경로는 소문자·숫자·_·- 만, 슬래시로
            구분 (2세그먼트 이상).
          </p>
        </div>

        <div>
          <Label className="text-slate-300">타입</Label>
          <Select
            value={type}
            onValueChange={(v) => setType(v as "javascript" | "adb_shell")}
          >
            <SelectTrigger className="mt-1 border-[#1e2130] bg-[#0d0e14] text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="javascript">javascript</SelectItem>
              <SelectItem value="adb_shell">adb_shell</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-slate-300">timeout_ms</Label>
          <Input
            type="number"
            min={1000}
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(Number(e.target.value) || 180000)}
            className="mt-1 border-[#1e2130] bg-[#0d0e14] text-white"
          />
        </div>
        <div>
          <Label className="text-slate-300">content</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="mt-1 font-mono text-sm border-[#1e2130] bg-[#0d0e14] text-white"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !isNameValid}>
            {saving ? "저장 중…" : "생성"}
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/legacy-dashboard/scripts">취소</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
