"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatCardsProps {
  worker: {
    id: string;
    name: string;
    status: string;
    uptime_seconds: number;
    last_heartbeat: string;
  } | null;
  devices: {
    total: number;
    online: number;
    busy: number;
    error: number;
    offline: number;
  };
  tasks: {
    running: number;
    pending: number;
    completed_today: number;
    failed_today: number;
  };
  proxies: {
    total: number;
    valid: number;
    invalid: number;
    unassigned: number;
  };
}

function getDeviceHealthColor(online: number, total: number): string {
  if (total === 0) return "bg-gray-500";
  const pct = (online / total) * 100;
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

function getProxyHealthColor(valid: number, total: number): string {
  if (total === 0) return "bg-gray-500";
  const pct = (valid / total) * 100;
  if (pct >= 95) return "bg-emerald-500";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-red-500";
}

function formatLastSeen(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}

export function StatCards({ worker, devices, tasks, proxies }: StatCardsProps) {
  const deviceHealthPct = devices.total > 0 ? Math.round((devices.online / devices.total) * 100) : 0;
  const deviceHealthColor = getDeviceHealthColor(devices.online, devices.total);

  const proxyHealthColor = getProxyHealthColor(proxies.valid, proxies.total);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Active Workers */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">활성 워커</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {worker ? 1 : 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {worker ? `마지막 하트비트: ${formatLastSeen(worker.last_heartbeat)}` : '워커 없음'}
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${worker?.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'}`} />
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Online Devices */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">온라인 디바이스</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {devices.online}/{devices.total}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {deviceHealthPct}% fleet health
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${deviceHealthColor}`} />
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Running Tasks */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">실행 중 작업</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {tasks.running}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {tasks.pending} pending, {tasks.completed_today} completed today
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${tasks.running > 0 ? 'bg-blue-500' : 'bg-gray-400'}`} />
          </div>
        </CardContent>
      </Card>

      {/* Card 4: Proxy Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">프록시 상태</p>
              <p className="text-3xl font-bold text-foreground mt-2">
                {proxies.valid}/{proxies.total}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {proxies.invalid} invalid, {proxies.unassigned} unassigned
              </p>
            </div>
            <div className={`w-3 h-3 rounded-full ${proxyHealthColor}`} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
