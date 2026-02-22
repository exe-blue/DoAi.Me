"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle, RefreshCw, Server, Smartphone, Timer, Wifi } from "lucide-react";

interface HealthReport {
  period: string;
  uptime_percent: number;
  total_tasks: number;
  tasks_completed: number;
  tasks_failed: number;
  tasks_timeout: number;
  devices_total: number;
  devices_online: number;
  device_recoveries: number;
  agent_restarts: number;
  xiaowei_disconnects: number;
  mass_dropouts: number;
  stale_tasks_recovered: number;
  timeline: { hour: string; current_online_devices: number; tasks_completed: number; errors: number }[];
  error_logs_count: number;
}

export function HealthReportPanel() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h");

  useEffect(() => {
    fetchReport();
  }, [period]);

  async function fetchReport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/health?report=true&period=${period}`);
      if (res.ok) {
        setReport(await res.json());
      }
    } catch (err) {
      console.error("[HealthReport] Fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !report) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            시스템 건강 리포트
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </CardContent>
      </Card>
    );
  }

  const uptimeColor = report.uptime_percent >= 95 ? "text-green-500" : report.uptime_percent >= 85 ? "text-yellow-500" : "text-red-500";
  const uptimeBarColor = report.uptime_percent >= 95 ? "bg-green-500" : report.uptime_percent >= 85 ? "bg-yellow-500" : "bg-red-500";

  // Find max values for timeline bar scaling
  const maxTasks = Math.max(...report.timeline.map(t => t.tasks_completed), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            시스템 건강 리포트
          </CardTitle>
          <div className="flex gap-1">
            {(["24h", "7d", "30d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Uptime Bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">가동률</span>
            <span className={`text-2xl font-bold ${uptimeColor}`}>
              {report.uptime_percent}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${uptimeBarColor} rounded-full transition-all`}
              style={{ width: `${Math.min(report.uptime_percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard icon={CheckCircle} label="작업 완료" value={report.tasks_completed} total={report.total_tasks} color="text-green-500" />
          <MetricCard icon={Smartphone} label="디바이스 복구" value={report.device_recoveries} color="text-blue-500" />
          <MetricCard icon={RefreshCw} label="에이전트 재시작" value={report.agent_restarts} color="text-orange-500" />
          <MetricCard icon={Wifi} label="Xiaowei 연결 끊김" value={report.xiaowei_disconnects} color="text-yellow-500" />
        </div>

        {/* Timeline (simplified bar chart) */}
        <div>
          <h4 className="text-sm font-medium mb-3">시간별 추이 (최근 24시간)</h4>
          <div className="flex items-end gap-0.5 h-20">
            {report.timeline.slice(-24).map((t, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/80 rounded-t-sm min-h-[2px] transition-all hover:bg-primary"
                style={{ height: `${(t.tasks_completed / maxTasks) * 100}%` }}
                title={`${t.hour}\n완료: ${t.tasks_completed}\n오류: ${t.errors}`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">24시간 전</span>
            <span className="text-[10px] text-muted-foreground">현재</span>
          </div>
        </div>

        {/* Incidents Summary */}
        {(report.tasks_failed > 0 || report.stale_tasks_recovered > 0 || report.mass_dropouts > 0) && (
          <div>
            <h4 className="text-sm font-medium mb-2">최근 이벤트</h4>
            <div className="space-y-1">
              {report.tasks_failed > 0 && (
                <IncidentRow icon={AlertTriangle} text={`작업 실패 ${report.tasks_failed}건`} color="text-red-500" />
              )}
              {report.stale_tasks_recovered > 0 && (
                <IncidentRow icon={Timer} text={`복구된 중단 작업 ${report.stale_tasks_recovered}건`} color="text-orange-500" />
              )}
              {report.mass_dropouts > 0 && (
                <IncidentRow icon={Server} text={`대량 드롭아웃 ${report.mass_dropouts}건`} color="text-red-500" />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({ icon: Icon, label, value, total, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total?: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">
          {value}{total !== undefined ? `/${total}` : ""}
        </p>
      </div>
    </div>
  );
}

function IncidentRow({ icon: Icon, text, color }: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`h-3.5 w-3.5 ${color}`} />
      <span>{text}</span>
    </div>
  );
}
