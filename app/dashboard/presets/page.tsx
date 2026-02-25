"use client";

import { useEffect, useState } from "react";
import { Zap, RefreshCw, Play } from "lucide-react";

interface Preset {
  id: string;
  name: string;
  type: string;
  description: string | null;
  config: Record<string, unknown>;
  created_at: string;
}

export default function PresetsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => setPresets(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">프리셋</h1>
        <p className="text-sm text-slate-500">미션 실행 프리셋 관리</p>
      </div>

      {presets.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Zap className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 프리셋이 없습니다</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {presets.map((p) => (
            <div key={p.id} className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5 hover:border-[#2a2d40]">
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
                <p className="mt-3 text-xs text-slate-400 line-clamp-2">{p.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
