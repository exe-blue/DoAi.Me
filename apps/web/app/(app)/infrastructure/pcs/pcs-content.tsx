"use client";

import { useMemo, useState, useEffect } from "react";
import useSWR from "swr";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { DetailSheet } from "@/components/detail-sheet";
import { Badge } from "@/components/ui/badge";

/** PC (API: workers) — UI only uses "PC" */
export type PCRow = {
  id: string;
  pc_number?: string;
  hostname?: string | null;
  status: string;
  last_heartbeat: string | null;
  device_count: number;
  online_count: number;
  max_devices: number;
};

type WorkersResponse = { workers: PCRow[] };
type WorkerDetailResponse = { worker: PCRow & Record<string, unknown>; devices: unknown[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
}

function pcDisplayName(row: PCRow): string {
  return row.pc_number ?? row.hostname ?? row.id.slice(0, 8);
}

export function PCsContent() {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: workersData, error, isLoading, mutate } = useSWR<WorkersResponse>("/api/workers", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: detailData } = useSWR<WorkerDetailResponse>(
    detailId ? `/api/workers/${detailId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!sheetOpen) setDetailId(null);
  }, [sheetOpen]);

  const pcs = workersData?.workers ?? [];

  const columns = useMemo<ColumnDef<PCRow>[]>(
    () => [
      {
        id: "pc_name",
        header: "PC",
        accessorFn: pcDisplayName,
        cell: (c) => pcDisplayName(c.row.original),
      },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string;
          return (
            <Badge
              variant={
                v === "online" ? "default" : v === "error" ? "destructive" : "secondary"
              }
            >
              {v}
            </Badge>
          );
        },
      },
      {
        id: "devices",
        header: "디바이스",
        accessorFn: (row) => `${row.online_count} / ${row.device_count}`,
        cell: (c) => c.getValue(),
      },
      {
        id: "last_heartbeat",
        header: "최근 heartbeat",
        accessorKey: "last_heartbeat",
        cell: (c) => formatDate(c.getValue() as string),
      },
    ],
    []
  );

  const handleRowClick = (row: PCRow) => {
    setDetailId(row.id);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      <DataTable<PCRow>
        data={pcs}
        columns={columns}
        searchPlaceholder="PC 검색…"
        onRowClick={handleRowClick}
        loading={isLoading}
        error={error ?? null}
        emptyTitle="PC 없음"
        emptyDescription="등록된 PC가 없습니다."
      />
      {pcs.length > 0 && (
        <p className="text-sm text-muted-foreground">총 {pcs.length}개 PC</p>
      )}
      <DetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={detailData?.worker ? pcDisplayName(detailData.worker as PCRow) + " 상세" : "PC 상세"}
      >
        {detailData ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">PC 정보</h4>
              <dl className="mt-2 grid gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">상태</dt>
                  <dd>
                    <Badge variant={detailData.worker.status === "online" ? "default" : "secondary"}>
                      {detailData.worker.status}
                    </Badge>
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">디바이스</dt>
                  <dd>
                    {detailData.worker.online_count ?? 0} / {detailData.worker.device_count ?? 0}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">최근 heartbeat</dt>
                  <dd>{formatDate(detailData.worker.last_heartbeat)}</dd>
                </div>
              </dl>
            </div>
            {detailData.devices?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">디바이스 ({detailData.devices.length})</h4>
                <pre className="mt-2 rounded bg-muted p-3 text-xs overflow-auto max-h-48">
                  {JSON.stringify(detailData.devices, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">로딩 중…</p>
        )}
      </DetailSheet>
    </div>
  );
}
