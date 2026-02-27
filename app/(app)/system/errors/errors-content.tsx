"use client";

import { useMemo, useState } from "react";
import { useListApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FiltersBar } from "@/components/filters-bar";
import { DetailSheet } from "@/components/detail-sheet";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ErrorItem = {
  type: string;
  count: number;
  severity: string;
  lastOccurred: string;
};

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

const LEVEL_OPTIONS = ["all", "error", "fatal"];

export function ErrorsContent() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [hours, setHours] = useState(24);
  const [detailRow, setDetailRow] = useState<ErrorItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const errorsUrl = useMemo(
    () =>
      "/api/dashboard/errors" +
      buildQuery({
        page,
        pageSize: 20,
        q: search.trim() || undefined,
        level: levelFilter === "all" ? undefined : levelFilter,
        hours,
      }),
    [page, search, levelFilter, hours]
  );

  const { list: errors, total, error, isLoading } = useListApi<ErrorItem>(errorsUrl);

  const columns = useMemo<ColumnDef<ErrorItem>[]>(
    () => [
      { id: "created_at", header: "발생 시각", accessorKey: "lastOccurred", cell: (c) => formatDate(c.getValue() as string) },
      {
        id: "level",
        header: "레벨",
        accessorKey: "severity",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant={v === "fatal" ? "destructive" : "secondary"}>{v}</Badge> : "—";
        },
      },
      { id: "message", header: "메시지(유형)", accessorKey: "type", cell: (c) => c.getValue() ?? "—" },
      { id: "pc_device", header: "PC/디바이스", cell: () => "—" },
      { id: "count", header: "건수", accessorKey: "count", cell: (c) => c.getValue() ?? 0 },
    ],
    []
  );

  const handleRowClick = (row: ErrorItem) => {
    setDetailRow(row);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      <FiltersBar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="메시지(유형) 검색"
        rightSlot={
          <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="레벨" />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "all" ? "전체" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <DataTable<ErrorItem>
        data={errors}
        columns={columns}
        searchPlaceholder="검색…"
        onRowClick={handleRowClick}
        loading={isLoading}
        error={error ?? null}
        emptyTitle="에러 없음"
        emptyDescription="최근 에러가 없습니다."
      />
      <DetailSheet open={sheetOpen} onOpenChange={setSheetOpen} title="에러 상세 (JSON)">
        <pre className="rounded bg-muted p-3 text-xs overflow-auto">
          {detailRow ? JSON.stringify(detailRow, null, 2) : ""}
        </pre>
      </DetailSheet>
    </div>
  );
}
