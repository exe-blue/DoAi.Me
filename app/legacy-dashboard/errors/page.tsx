"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { AlertTriangle, RefreshCw, Clock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/api";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface ErrorSummary {
  type: string;
  count: number;
  severity: string;
  lastOccurred: string;
}

interface LogEntry {
  id: string;
  message?: string;
  level?: string;
  device_serial?: string;
  created_at?: string;
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
  timeout: "#f59e0b",
  adb_connection: "#ef4444",
  proxy: "#f97316",
  account: "#ef4444",
  youtube: "#3b82f6",
  bot_detection: "#dc2626",
  database: "#a855f7",
  other: "#64748b",
};

function buildErrorsKey(hours: number) {
  return `/api/dashboard/errors?hours=${hours}`;
}

function buildLogsKey(hours: number) {
  return `/api/logs?level=error&limit=100`;
}

export default function ErrorsPage() {
  const [hours, setHours] = useState(24);

  const errorsKey = buildErrorsKey(hours);
  const { data: errorsData, error: errorsError, isLoading: errorsLoading, mutate: mutateErrors } = useSWR<{
    errors?: ErrorSummary[];
    totalErrors?: number;
  }>(errorsKey, fetcher);

  const logsKey = buildLogsKey(hours);
  const { data: logsData } = useSWR<{ logs: LogEntry[] }>(logsKey, fetcher);

  const errors: ErrorSummary[] = errorsData?.errors ?? [];
  const totalErrors = errorsData?.totalErrors ?? 0;
  const logs = logsData?.logs ?? [];

  const pieData = useMemo(
    () =>
      errors.map((e) => ({
        name: TYPE_LABELS[e.type] ?? e.type,
        value: e.count,
        fill: TYPE_COLORS[e.type] ?? "#64748b",
      })),
    [errors]
  );

  const formatTime = (d: string | undefined) => {
    if (!d) return "—";
    return new Date(d).toLocaleTimeString("ko-KR", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">에러</h1>
          <p className="text-sm text-slate-500">
            최근 {hours}시간: {totalErrors}건
          </p>
        </div>
        <Select
          value={String(hours)}
          onValueChange={(v) => setHours(Number(v))}
        >
          <SelectTrigger className="w-28 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1시간</SelectItem>
            <SelectItem value="6">6시간</SelectItem>
            <SelectItem value="24">24시간</SelectItem>
            <SelectItem value="72">3일</SelectItem>
            <SelectItem value="168">7일</SelectItem>
            <SelectItem value="720">30일</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {errorsError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          요약을 불러오지 못했습니다.{" "}
          <button
            type="button"
            onClick={() => mutateErrors()}
            className="underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {errorsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : errors.length === 0 ? (
        <div className="rounded-xl border border-green-900/30 bg-green-950/10 p-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-green-500" />
          <p className="mt-3 text-lg font-medium text-green-400">에러 없음</p>
          <p className="mt-1 text-xs text-green-600">시스템 정상 운영 중</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              에러 유형 분포
            </span>
            <div className="mt-3 flex items-center gap-6">
              <div className="h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {pieData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#12141d",
                        border: "1px solid #1e2130",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number, n: string) => [`${v}건`, n]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded"
                      style={{ background: d.fill }}
                    />
                    <span className="w-20 text-xs text-slate-400">{d.name}</span>
                    <span className="font-mono text-sm font-bold text-white">
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 text-center">
              <span className="font-mono text-3xl font-bold text-white">
                {totalErrors}
              </span>
              <span className="ml-2 text-xs text-slate-500">건 총 에러</span>
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              에러 상세
            </span>
            <div className="mt-3 space-y-2.5">
              {errors.map((err, i) => {
                const pct =
                  totalErrors > 0
                    ? Math.round((err.count / totalErrors) * 100)
                    : 0;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-[#1e2130] bg-[#0d1117] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className="h-3.5 w-3.5"
                          style={{
                            color: TYPE_COLORS[err.type] ?? "#64748b",
                          }}
                        />
                        <span className="text-sm font-medium text-white">
                          {TYPE_LABELS[err.type] ?? err.type}
                        </span>
                      </div>
                      <span className="font-mono text-lg font-bold text-white">
                        {err.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#1e2130]">
                      <div
                        className="h-1.5 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: TYPE_COLORS[err.type] ?? "#64748b",
                        }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {err.lastOccurred
                          ? new Date(err.lastOccurred).toLocaleString("ko-KR")
                          : "—"}
                      </span>
                      <span>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Error logs table — same format as logs page, level=error */}
      <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          에러 로그 (level=error)
        </span>
        <div className="mt-3 overflow-hidden rounded-lg border border-[#1e2130] bg-[#0d1117]">
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-600">
              에러 로그 없음
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full font-mono text-[11px]">
                <thead className="sticky top-0 bg-[#0d1117]">
                  <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                    <th className="w-20 px-3 py-2 text-left">시각</th>
                    <th className="w-28 px-3 py-2 text-left">디바이스</th>
                    <th className="px-3 py-2 text-left">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l, i) => (
                    <tr
                      key={l.id ?? i}
                      className="border-b border-[#1e2130]/20 hover:bg-[#12141d]/50"
                    >
                      <td className="whitespace-nowrap px-3 py-1 text-slate-600">
                        {formatTime(l.created_at)}
                      </td>
                      <td className="max-w-[110px] truncate px-3 py-1 text-slate-500">
                        {l.device_serial ?? "—"}
                      </td>
                      <td className="truncate px-3 py-1 text-slate-400">
                        {l.message ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
