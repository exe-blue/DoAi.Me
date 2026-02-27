"use client";

interface HealthBarProps {
  devices: {
    total: number;
    online: number;
    busy: number;
    error: number;
    offline: number;
  };
}

export function HealthBar({ devices }: HealthBarProps) {
  const { total, online, busy, error, offline } = devices;

  if (total === 0) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-muted-foreground">플릿 상태</span>
          <span className="text-sm text-muted-foreground">0/0 online</span>
        </div>
        <div className="w-full h-8 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  const onlinePercent = (online / total) * 100;
  const busyPercent = (busy / total) * 100;
  const errorPercent = (error / total) * 100;
  const offlinePercent = (offline / total) * 100;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">플릿 상태</span>
        <span className="text-sm font-semibold text-foreground">
          {online}/{total} online
        </span>
      </div>
      <div className="w-full h-8 bg-gray-200 rounded-lg overflow-hidden flex">
        {online > 0 && (
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${onlinePercent}%` }}
            title={`온라인: ${online}`}
          />
        )}
        {busy > 0 && (
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${busyPercent}%` }}
            title={`사용 중: ${busy}`}
          />
        )}
        {error > 0 && (
          <div
            className="h-full bg-red-500 transition-all duration-500"
            style={{ width: `${errorPercent}%` }}
            title={`에러: ${error}`}
          />
        )}
        {offline > 0 && (
          <div
            className="h-full bg-gray-400 transition-all duration-500"
            style={{ width: `${offlinePercent}%` }}
            title={`오프라인: ${offline}`}
          />
        )}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-emerald-500" />
          <span>온라인 {online}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-blue-500" />
          <span>사용중 {busy}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-red-500" />
          <span>에러 {error}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-400" />
          <span>오프라인 {offline}</span>
        </div>
      </div>
    </div>
  );
}
