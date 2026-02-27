"use client";

import { useMemo, useState, useEffect } from "react";
import { useListApi, useApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FiltersBar } from "@/components/filters-bar";
import { DetailSheet } from "@/components/detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Device = {
  id?: string;
  sort_order?: number | null;
  serial?: string;
  connection_id?: string | null;
  worker_id?: string | null;
  status?: string | null;
  last_seen?: string | null;
  nickname?: string | null;
  created_at?: string | null;
};

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

const STATUS_OPTIONS = ["all", "online", "offline", "busy", "error", "idle", "disconnected"];

export function DevicesContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string>("last_seen");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const devicesUrl = useMemo(
    () =>
      "/api/devices" +
      buildQuery({
        page,
        pageSize: 20,
        q: search.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        sortBy,
        sortOrder,
      }),
    [page, search, statusFilter, sortBy, sortOrder]
  );

  const { list: devices, total, error, isLoading } = useListApi<Device>(devicesUrl);
  const { data: detailDevice } = useApi<Device>(detailId ? `/api/devices/${detailId}` : null);

  useEffect(() => {
    if (sheetOpen && detailId) return;
    if (!sheetOpen) setDetailId(null);
  }, [sheetOpen, detailId]);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        id: "device_number",
        header: "디바이스 번호",
        accessorFn: (row) => row.sort_order ?? row.id?.slice(0, 8),
        cell: (c) => c.getValue() ?? "—",
      },
      { id: "serial", header: "시리얼", accessorKey: "serial", cell: (c) => c.getValue() ?? "—" },
      { id: "connection_id", header: "연결 ID", accessorKey: "connection_id", cell: (c) => c.getValue() ?? "—" },
      { id: "worker_id", header: "PC ID", accessorKey: "worker_id", cell: (c) => c.getValue() ?? "—" },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant="secondary">{v}</Badge> : "—";
        },
      },
      { id: "last_seen", header: "최근 접속", accessorKey: "last_seen", cell: (c) => formatDate(c.getValue() as string) },
    ],
    []
  );

  const handleRowClick = (row: Device) => {
    if (row.id) {
      setDetailId(row.id);
      setSheetOpen(true);
    }
  };

  return (
    <div className="space-y-4">
      <FiltersBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="시리얼/연결ID/이름 검색"
        rightSlot={
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "전체" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <DataTable<Device>
        data={devices}
        columns={columns}
        searchPlaceholder="검색…"
        onRowClick={handleRowClick}
        loading={isLoading}
        error={error ?? null}
        emptyTitle="디바이스 없음"
        emptyDescription="연결된 디바이스가 없습니다."
      />
      {total > 0 && (
        <p className="text-sm text-muted-foreground">
          총 {total}개 (페이지 {page})
        </p>
      )}
      <DetailSheet open={sheetOpen} onOpenChange={setSheetOpen} title="디바이스 상세">
        <pre className="rounded bg-muted p-3 text-xs overflow-auto">
          {detailDevice ? JSON.stringify(detailDevice, null, 2) : "로딩 중…"}
        </pre>
      </DetailSheet>
    </div>
  );
}
