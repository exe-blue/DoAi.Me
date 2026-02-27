"use client";

import { useEffect, useState } from "react";
import { CheckCircle, RefreshCw, Eye, Heart, MessageSquare } from "lucide-react";

interface TimelineItem {
  id: string;
  serial?: string | null;
  device_serial?: string;
  status: string;
  duration?: number | null;
  final_duration_sec?: number | null;
  watchPct?: number | null;
  watch_percentage?: number | null;
  actions?: { liked?: boolean; commented?: boolean };
  did_like?: boolean;
  did_comment?: boolean;
  timestamps?: { completed?: string | null };
  completed_at?: string | null;
}

export function CompletedContent() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    fetch(`/api/dashboard/screenshots?date=${today}`)
      .then((r) => r.json())
      .then((d) => setItems(d.data?.timeline ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completed = items.filter((i) => i.status === "completed");

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {completed.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            오늘 완료된 작업이 없습니다
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">디바이스</th>
                <th className="px-4 py-3">시청 시간</th>
                <th className="px-4 py-3">시청률</th>
                <th className="px-4 py-3">액션</th>
                <th className="px-4 py-3">완료 시각</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border/50 hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {item.serial ?? item.device_serial ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {item.duration ?? item.final_duration_sec ?? 0}초
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-green-600"
                          style={{
                            width: `${item.watchPct ?? item.watch_percentage ?? 0}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.watchPct ?? item.watch_percentage ?? 0}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      {(item.actions?.liked ?? item.did_like) && (
                        <Heart className="h-3.5 w-3.5 text-red-500" />
                      )}
                      {(item.actions?.commented ?? item.did_comment) && (
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      )}
                      {!(item.actions?.liked ?? item.did_like) &&
                        !(item.actions?.commented ?? item.did_comment) && (
                          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {(item.timestamps?.completed ?? item.completed_at)
                      ? new Date(
                          item.timestamps?.completed ?? item.completed_at ?? ""
                        ).toLocaleTimeString("ko-KR")
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
