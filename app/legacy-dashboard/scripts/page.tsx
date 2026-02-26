"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FileCode, RefreshCw, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

type ScriptRow = {
  id: string;
  name: string;
  version: number;
  status: string;
  type: string;
  timeout_ms: number;
  created_at: string | null;
};

function useScriptsList(params: {
  name?: string;
  status?: string;
  type?: string;
  latestOnly?: boolean;
}) {
  const search = new URLSearchParams();
  if (params.name) search.set("name", params.name);
  if (params.status) search.set("status", params.status);
  if (params.type) search.set("type", params.type);
  if (params.latestOnly === false) search.set("latestOnly", "false");
  const q = search.toString();
  const url = `/api/scripts${q ? `?${q}` : ""}`;
  return useSWR<{ scripts: ScriptRow[] }>(url, fetcher, {
    refreshInterval: 30_000,
  });
}

export default function ScriptsPage() {
  const [nameSearch, setNameSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showAllVersions, setShowAllVersions] = useState(false);

  const { data, error, isLoading, mutate } = useScriptsList({
    name: nameSearch.trim() || undefined,
    status: statusFilter || undefined,
    type: typeFilter || undefined,
    latestOnly: !showAllVersions,
  });

  const scripts = data?.scripts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">스크립트</h1>
          <p className="text-sm text-slate-500">
            DB SSOT · 버전별 관리, 활성화 시 발행/실행에 사용
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => mutate()}
            className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:text-white"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 새로고침
          </Button>
          <Button
            asChild
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Link href="/legacy-dashboard/scripts/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> 새 스크립트
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            placeholder="이름 검색..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            className="pl-8 border-[#1e2130] bg-[#12141d] text-white placeholder:text-slate-500"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={setStatusFilter}
        >
          <SelectTrigger className="w-[130px] border-[#1e2130] bg-[#12141d] text-slate-300">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="draft">draft</SelectItem>
            <SelectItem value="active">active</SelectItem>
            <SelectItem value="archived">archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[130px] border-[#1e2130] bg-[#12141d] text-slate-300">
            <SelectValue placeholder="타입" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            <SelectItem value="javascript">javascript</SelectItem>
            <SelectItem value="adb_shell">adb_shell</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-400">
          <input
            type="checkbox"
            checked={showAllVersions}
            onChange={(e) => setShowAllVersions(e.target.checked)}
            className="rounded border-[#1e2130] bg-[#12141d]"
          />
          전체 버전
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button
            type="button"
            onClick={() => mutate()}
            className="underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : scripts.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <FileCode className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 스크립트가 없습니다</p>
          <Button asChild className="mt-4">
            <Link href="/legacy-dashboard/scripts/new">새 스크립트 만들기</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-slate-400">
                <th className="p-3 font-medium">이름</th>
                <th className="p-3 font-medium">버전</th>
                <th className="p-3 font-medium">상태</th>
                <th className="p-3 font-medium">타입</th>
                <th className="p-3 font-medium">timeout_ms</th>
                <th className="p-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => (
                <tr
                  key={`${s.id}-${s.version}`}
                  className="border-b border-[#1e2130]/80 hover:bg-[#1a1c28]"
                >
                  <td className="p-3 font-medium text-white">{s.name}</td>
                  <td className="p-3 text-slate-300">v{s.version}</td>
                  <td className="p-3">
                    <Badge
                      variant={
                        s.status === "active"
                          ? "default"
                          : s.status === "archived"
                            ? "secondary"
                            : "outline"
                      }
                      className={
                        s.status === "active"
                          ? "bg-green-600/20 text-green-400 border-green-600/40"
                          : ""
                      }
                    >
                      {s.status}
                    </Badge>
                  </td>
                  <td className="p-3 text-slate-400">{s.type}</td>
                  <td className="p-3 text-slate-400">{s.timeout_ms}</td>
                  <td className="p-3">
                    <Link
                      href={`/legacy-dashboard/scripts/${s.id}?version=${s.version}`}
                      className="text-primary hover:underline"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
