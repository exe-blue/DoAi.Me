"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

type WorkflowRow = {
  id: string;
  version: number;
  kind?: string;
  name?: string;
  is_active?: boolean;
};

type Response = { workflows: WorkflowRow[] };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function WorkflowsContent() {
  const { data, error, isLoading } = useSWR<Response>("/api/workflows", fetcher);
  const workflows = data?.workflows ?? [];

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (error) return <p className="text-sm text-destructive">목록을 불러올 수 없습니다.</p>;
  if (workflows.length === 0) return <p className="text-muted-foreground py-4">워크플로우가 없습니다.</p>;

  return (
    <ul className="space-y-2">
      {workflows.map((w) => (
        <li key={`${w.id}-${w.version}`} className="rounded-lg border p-3 text-sm">
          <span className="font-medium">{w.name ?? w.id}</span>
          <span className="text-muted-foreground ml-2">v{w.version}</span>
          {w.is_active !== undefined && <span className="ml-2">{w.is_active ? "활성" : "비활성"}</span>}
        </li>
      ))}
    </ul>
  );
}
