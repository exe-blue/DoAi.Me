"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

type ScriptRow = {
  id: string;
  name: string;
  version: number;
  status?: string;
  type?: string;
};

type Response = { scripts: ScriptRow[] };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function ScriptsContent() {
  const { data, error, isLoading } = useSWR<Response>("/api/scripts", fetcher);
  const scripts = data?.scripts ?? [];

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (error) return <p className="text-sm text-destructive">목록을 불러올 수 없습니다.</p>;
  if (scripts.length === 0) return <p className="text-muted-foreground py-4">스크립트가 없습니다.</p>;

  return (
    <ul className="space-y-2">
      {scripts.map((s) => (
        <li key={`${s.id}-${s.version}`} className="rounded-lg border p-3 text-sm">
          <span className="font-medium">{s.name}</span>
          <span className="text-muted-foreground ml-2">v{s.version}</span>
          {s.status && <span className="ml-2">{s.status}</span>}
        </li>
      ))}
    </ul>
  );
}
