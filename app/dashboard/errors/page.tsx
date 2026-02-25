"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ErrorSummary {
  type: string;
  count: number;
  severity: string;
  lastOccurred: string;
}

const TYPE_LABELS: Record<string, string> = {
  timeout: "타임아웃",
  adb_connection: "ADB 연결",
  proxy: "프록시",
  account: "계정",
  youtube: "YouTube",
  bot_detection: "봇 감지",
  database: "데이터베이스",
  other: "기타",
};

const TYPE_COLORS: Record<string, string> = {
  timeout: "text-amber-400",
  adb_connection: "text-red-400",
  proxy: "text-orange-400",
  account: "text-red-400",
  youtube: "text-blue-400",
  bot_detection: "text-red-500",
  database: "text-purple-400",
  other: "text-slate-400",
};

export default function ErrorsPage() {
  const [errors, setErrors] = useState<ErrorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("24");
  const [totalErrors, setTotalErrors] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/errors?hours=${hours}`)
      .then((r) => r.json())
      .then((d) => {
        setErrors(d.data?.errors || []);
        setTotalErrors(d.data?.totalErrors || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [hours]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">에러 모니터링</h1>
          <p className="text-sm text-slate-500">최근 {hours}시간: {totalErrors}건</p>
        </div>
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-32 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1시간</SelectItem>
            <SelectItem value="6">6시간</SelectItem>
            <SelectItem value="24">24시간</SelectItem>
            <SelectItem value="72">3일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : errors.length === 0 ? (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-3 text-sm text-green-400">에러 없음 — 시스템 정상</p>
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((err, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-[#1e2130] bg-[#12141d] px-5 py-4 hover:border-[#2a2d40]"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-900/20">
                  <AlertTriangle className={`h-5 w-5 ${TYPE_COLORS[err.type] || "text-slate-400"}`} />
                </div>
                <div>
                  <div className="font-medium text-white">
                    {TYPE_LABELS[err.type] || err.type}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="h-3 w-3" />
                    마지막: {err.lastOccurred ? new Date(err.lastOccurred).toLocaleString("ko-KR") : "—"}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl font-bold text-white">{err.count}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">건</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
