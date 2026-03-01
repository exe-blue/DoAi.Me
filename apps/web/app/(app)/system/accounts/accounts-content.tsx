"use client";

import useSWR from "swr";
import { Skeleton } from "@/components/ui/skeleton";

type AccountRow = {
  id: string;
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type Response = { accounts: AccountRow[] };
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AccountsContent() {
  const { data, error, isLoading } = useSWR<Response>("/api/accounts", fetcher);
  const accounts = data?.accounts ?? [];

  if (isLoading) return <Skeleton className="h-48 w-full rounded-lg" />;
  if (error) return <p className="text-sm text-destructive">목록을 불러올 수 없습니다.</p>;
  if (accounts.length === 0) return <p className="text-muted-foreground py-4">계정이 없습니다.</p>;

  return (
    <ul className="space-y-2">
      {accounts.map((a) => (
        <li key={a.id} className="rounded-lg border p-3 text-sm">
          <span className="font-medium">{a.email ?? a.id}</span>
          {a.status && <span className="ml-2 text-muted-foreground">{a.status}</span>}
        </li>
      ))}
    </ul>
  );
}
