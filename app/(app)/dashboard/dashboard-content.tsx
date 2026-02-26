"use client";

import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Widget from "@/components/dashboard/widget";
import SecurityStatus from "@/components/dashboard/security-status";

type Overview = {
  worker?: { id: string; name: string; status: string; last_heartbeat: string | null } | null;
  devices?: { total: number; online: number; busy: number; error: number; offline: number };
  tasks?: { running: number; pending: number; completed_today: number; failed_today: number };
  proxies?: { total: number; valid: number; invalid: number; unassigned: number };
  timestamp?: string;
};

export function DashboardContent() {
  const { data, error, isLoading } = useApi<Overview>("/api/overview");

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  const devices = data?.devices;
  const tasks = data?.tasks;
  const proxies = data?.proxies;
  const worker = data?.worker;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">디바이스</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{devices?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              온라인 {devices?.online ?? 0} / 사용중 {devices?.busy ?? 0} / 에러 {devices?.error ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">작업</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(tasks?.running ?? 0) + (tasks?.pending ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              실행중 {tasks?.running ?? 0} / 대기 {tasks?.pending ?? 0} / 오늘 완료 {tasks?.completed_today ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">프록시</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proxies?.total ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              유효 {proxies?.valid ?? 0} / 무효 {proxies?.invalid ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PC</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{worker ? 1 : 0}</div>
            <p className="text-xs text-muted-foreground">
              {worker ? (
                <Badge variant={worker.status === "online" ? "default" : "secondary"}>
                  {worker.name} · {worker.status}
                </Badge>
              ) : (
                "없음"
              )}
            </p>
          </CardContent>
        </Card>
        <div className="min-h-[140px]">
          <Widget />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SecurityStatus />
      </div>
    </div>
  );
}
