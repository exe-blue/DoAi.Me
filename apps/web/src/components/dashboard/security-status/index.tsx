"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { useApi } from "@/hooks/use-api";

const GIF_TINT = "gif-tint-lime";

type Overview = {
  devices?: { total: number; online: number; busy: number; error: number };
  tasks?: { running: number; pending: number };
};

export default function SecurityStatus() {
  const [imgError, setImgError] = useState(false);
  const { data, error, isLoading } = useApi<Overview>("/api/overview");

  const devices = data?.devices;
  const tasks = data?.tasks;
  const online = devices?.online ?? 0;
  const total = devices?.total ?? 0;
  const statusLabel =
    total === 0
      ? "등록 없음"
      : online === total
        ? "정상"
        : online > 0
          ? "일부 온라인"
          : "오프라인";

  return (
    <Card className="w-full relative overflow-hidden bg-card border-border">
      {!imgError && (
        <div className="absolute top-0 right-0 w-32 h-32 md:w-40 md:h-40 z-0 pointer-events-none opacity-20 relative">
          <Image
            src="/assets/bot_greenprint.gif"
            alt=""
            fill
            className={`object-contain ${GIF_TINT}`}
            unoptimized
            onError={() => setImgError(true)}
          />
        </div>
      )}

      <CardHeader className="relative z-10 pb-2">
        <CardTitle className="text-sm font-medium">시스템 상태</CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">로딩 중...</p>
        )}
        {error && (
          <p className="text-xs text-destructive">상태를 불러올 수 없습니다.</p>
        )}
        {!isLoading && !error && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {online} / {total}
              </span>
              <span className="text-xs text-muted-foreground">디바이스 온라인</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge
                variant={
                  statusLabel === "정상"
                    ? "default"
                    : statusLabel === "오프라인"
                      ? "destructive"
                      : "secondary"
                }
              >
                {statusLabel}
              </Badge>
              {typeof tasks?.running === "number" && (
                <Badge variant="outline">실행 중 작업 {tasks.running}</Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
