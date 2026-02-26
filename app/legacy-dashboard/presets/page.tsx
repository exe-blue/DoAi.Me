"use client";

import useSWR from "swr";
import { Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/api";

interface Preset {
  id: string;
  name: string;
  type: string;
  description: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export default function PresetsPage() {
  const { data, error, isLoading, mutate } = useSWR<{ presets: Preset[] }>(
    "/api/presets",
    fetcher,
    { refreshInterval: 60_000 }
  );

  const presets = data?.presets ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">프리셋</h1>
          <p className="text-sm text-slate-500">미션 실행 프리셋 관리</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutate()}
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:text-white"
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> 새로고침
        </Button>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : presets.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Zap className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 프리셋이 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {presets.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5 transition-colors hover:border-[#2a2d40]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-white">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.type}</div>
                  </div>
                </div>
              </div>
              {p.description && (
                <p className="mt-3 line-clamp-2 text-xs text-slate-400">
                  {p.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
