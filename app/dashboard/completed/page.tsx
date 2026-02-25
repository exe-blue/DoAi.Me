"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw, Eye, Heart, MessageSquare } from "lucide-react";

interface Assignment {
  id: string;
  device_serial: string;
  status: string;
  final_duration_sec: number | null;
  watch_percentage: number | null;
  did_like: boolean;
  did_comment: boolean;
  completed_at: string | null;
}

export default function CompletedPage() {
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/dashboard/screenshots?date=${today}`)
      .then((r) => r.json())
      .then((d) => setItems(d.data?.timeline || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completed = items.filter((i) => i.status === "completed");

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">완료</h1>
        <p className="text-sm text-slate-500">오늘 완료된 작업 {completed.length}건</p>
      </div>

      {completed.length === 0 ? (
        <div className="rounded-xl border border-[#1a2332] bg-[#0d1520] p-12 text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">오늘 완료된 작업이 없습니다</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1a2332] bg-[#0d1520] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1a2332] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">디바이스</th>
                <th className="px-4 py-3">시청 시간</th>
                <th className="px-4 py-3">시청률</th>
                <th className="px-4 py-3">액션</th>
                <th className="px-4 py-3">완료 시각</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((item: any) => (
                <tr key={item.id} className="border-b border-[#1a2332]/50 hover:bg-[#111827]/30">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{item.serial || item.device_serial || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{item.duration || item.final_duration_sec || 0}초</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-[#1a2332]">
                        <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${item.watchPct || item.watch_percentage || 0}%` }} />
                      </div>
                      <span className="font-mono text-xs text-slate-400">{item.watchPct || item.watch_percentage || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      {(item.actions?.liked || item.did_like) && <Heart className="h-3.5 w-3.5 text-red-400" />}
                      {(item.actions?.commented || item.did_comment) && <MessageSquare className="h-3.5 w-3.5 text-blue-400" />}
                      {!(item.actions?.liked || item.did_like) && !(item.actions?.commented || item.did_comment) && (
                        <Eye className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {(item.timestamps?.completed || item.completed_at)
                      ? new Date(item.timestamps?.completed || item.completed_at).toLocaleTimeString("ko-KR")
                      : "—"}
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
