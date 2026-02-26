"use client";

import { useRealtimeStatus } from "@/hooks/use-realtime-manager";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const { status, retryDelay } = useRealtimeStatus();
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (status === "disconnected") {
      setCountdown(Math.ceil(retryDelay / 1000));
      const interval = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setCountdown(0);
    }
  }, [status, retryDelay]);

  if (status === "connected") {
    return (
      <div className="flex items-center gap-1.5">
        <div className={cn("h-2 w-2 rounded-full bg-status-success")} />
        <span className="text-xs text-muted-foreground">연결됨</span>
      </div>
    );
  }

  if (status === "connecting") {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "h-2 w-2 rounded-full bg-status-warning animate-pulse"
          )}
        />
        <span className="text-xs text-muted-foreground">연결 중...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-2 w-2 rounded-full bg-status-error")} />
      <span className="text-xs text-muted-foreground">
        재연결 중 ({countdown}초)
      </span>
    </div>
  );
}
