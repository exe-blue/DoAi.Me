"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

type ScheduleRow = {
  id: string;
  name?: string | null;
  cron_expression?: string | null;
  is_active?: boolean;
};

type Response = { schedules: ScheduleRow[] };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SchedulesContent() {
  const { data, error, isLoading } = useSWR<Response>("/api/schedules", fetcher);
  const schedules = data?.schedules ?? [];

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (error) return <p className="text-sm text-destructive">목록을 불러올 수 없습니다.</p>;
  if (schedules.length === 0) return <p className="text-muted-foreground py-4">스케줄이 없습니다.</p>;

  return (
    <ul className="space-y-2">
      {schedules.map((s) => (
        <li key={s.id} className="rounded-lg border p-3 text-sm">
          <span className="font-medium">{s.name ?? s.id}</span>
          <span className="text-muted-foreground ml-2">{s.cron_expression}</span>
          {s.is_active !== undefined && <span className="ml-2">{s.is_active ? "활성" : "비활성"}</span>}
        </li>
      ))}
    </ul>
  );
}
