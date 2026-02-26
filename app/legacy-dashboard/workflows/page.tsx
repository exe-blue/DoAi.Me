"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ListOrdered, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/api";

type WorkflowRow = {
  id: string;
  version: number;
  kind: string;
  name: string;
  is_active: boolean;
  steps: unknown;
  created_at: string | null;
  updated_at: string | null;
};

export default function WorkflowsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ workflows: WorkflowRow[] }>(
    "/api/workflows",
    fetcher,
    { refreshInterval: 30_000 }
  );

  const workflows = data?.workflows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">워크플로우</h1>
          <p className="text-sm text-slate-500">
            DB SSOT · steps 검증(validateWorkflowSteps) · 발행 시 snapshot으로 복사
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
            <Link href="/legacy-dashboard/workflows/new">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> 새 워크플로우
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button type="button" onClick={() => mutate()} className="underline">
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <ListOrdered className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 워크플로우가 없습니다</p>
          <Button asChild className="mt-4">
            <Link href="/legacy-dashboard/workflows/new">새 워크플로우 만들기</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-slate-400">
                <th className="p-3 font-medium">id</th>
                <th className="p-3 font-medium">버전</th>
                <th className="p-3 font-medium">이름</th>
                <th className="p-3 font-medium">kind</th>
                <th className="p-3 font-medium">updated_at</th>
                <th className="p-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr
                  key={`${w.id}-${w.version}`}
                  className="border-b border-[#1e2130]/80 hover:bg-[#1a1c28]"
                >
                  <td className="p-3 font-medium text-white">{w.id}</td>
                  <td className="p-3 text-slate-300">v{w.version}</td>
                  <td className="p-3 text-slate-300">{w.name}</td>
                  <td className="p-3 text-slate-400">{w.kind}</td>
                  <td className="p-3 text-slate-500">
                    {w.updated_at
                      ? new Date(w.updated_at).toLocaleString()
                      : "-"}
                  </td>
                  <td className="p-3">
                    <Link
                      href={`/legacy-dashboard/workflows/${encodeURIComponent(w.id)}?version=${w.version}`}
                      className="text-primary hover:underline"
                    >
                      편집
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
