"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WorkerDetailProps {
  worker: {
    id: string;
    name: string;
    status: string;
    uptime_seconds: number;
    last_heartbeat: string;
    ip_address?: string | null;
  } | null;
  devices: {
    total: number;
    online: number;
    busy: number;
    error: number;
    offline: number;
  };
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function formatHeartbeatAge(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}

export function WorkerDetail({ worker, devices }: WorkerDetailProps) {
  const [heartbeatAge, setHeartbeatAge] = useState<string>("");

  useEffect(() => {
    if (!worker) return;

    // Update heartbeat age every second
    const updateAge = () => {
      setHeartbeatAge(formatHeartbeatAge(worker.last_heartbeat));
    };

    updateAge();
    const interval = setInterval(updateAge, 1000);

    return () => clearInterval(interval);
  }, [worker]);

  if (!worker) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">워커 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">활성 워커가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const { total, online, busy, error, offline } = devices;
  const onlinePercent = total > 0 ? (online / total) * 100 : 0;
  const busyPercent = total > 0 ? (busy / total) * 100 : 0;
  const errorPercent = total > 0 ? (error / total) * 100 : 0;
  const offlinePercent = total > 0 ? (offline / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">워커 상세</CardTitle>
          <Badge variant={worker.status === 'online' ? 'default' : 'destructive'}>
            {worker.status === 'online' ? '온라인' : '오프라인'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Worker Info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">워커 이름</p>
            <p className="font-medium">{worker.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">IP 주소</p>
            <p className="font-medium">{worker.ip_address || 'N/A'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">가동 시간</p>
            <p className="font-medium">{formatUptime(worker.uptime_seconds)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">마지막 하트비트</p>
            <p className="font-medium">{heartbeatAge}</p>
          </div>
        </div>

        {/* Mini Health Bar */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">디바이스 상태</p>
          <div className="w-full h-6 bg-gray-200 rounded-md overflow-hidden flex">
            {online > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${onlinePercent}%` }}
              />
            )}
            {busy > 0 && (
              <div
                className="h-full bg-blue-500 transition-all duration-500"
                style={{ width: `${busyPercent}%` }}
              />
            )}
            {error > 0 && (
              <div
                className="h-full bg-red-500 transition-all duration-500"
                style={{ width: `${errorPercent}%` }}
              />
            )}
            {offline > 0 && (
              <div
                className="h-full bg-gray-400 transition-all duration-500"
                style={{ width: `${offlinePercent}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{online} 온라인</span>
            <span>{busy} 사용중</span>
            <span>{error} 에러</span>
            <span>{offline} 오프라인</span>
          </div>
        </div>

        {/* Active Tasks Placeholder */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">활성 작업</p>
          <p className="text-xs text-muted-foreground italic">작업 목록은 곧 추가됩니다.</p>
        </div>
      </CardContent>
    </Card>
  );
}
