"use client";

import { useEffect, useState } from "react";
import { Upload, RefreshCw, Play, Eye, Heart, MessageSquare } from "lucide-react";

interface Video {
  id: string;
  title: string;
  channel_name?: string;
  status: string;
  target_views: number | null;
  completed_views: number | null;
  prob_like: number | null;
  prob_comment: number | null;
  duration_sec: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-amber-500",
  completed: "bg-blue-500",
  archived: "bg-slate-600",
};

export default function ContentPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d.data || [];
        setVideos(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">콘텐츠 등록</h1>
          <p className="text-sm text-slate-500">미션 대상 영상 관리</p>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <Upload className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 text-sm text-slate-500">등록된 영상이 없습니다</p>
          <p className="text-xs text-slate-600">채널 관리에서 영상을 등록해주세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {videos.map((v) => {
            const target = v.target_views || 0;
            const done = v.completed_views || 0;
            const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;

            return (
              <div key={v.id} className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4 hover:border-[#2a2d40]">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#1a1d2e]">
                    <Play className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[v.status] || "bg-slate-600"}`} />
                      <span className="text-sm font-medium text-white truncate">{v.title || v.id}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      {v.channel_name && <span>{v.channel_name}</span>}
                      {v.duration_sec && <span>{Math.round(v.duration_sec / 60)}분</span>}
                      <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {done}/{target}</span>
                      {v.prob_like && <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" /> {v.prob_like}%</span>}
                      {v.prob_comment && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" /> {v.prob_comment}%</span>}
                    </div>
                  </div>
                  <div className="w-32 text-right">
                    <div className="font-mono text-lg font-bold text-white">{pct}%</div>
                    <div className="mt-1 h-1.5 rounded-full bg-[#1e2130]">
                      <div className="h-1.5 rounded-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
