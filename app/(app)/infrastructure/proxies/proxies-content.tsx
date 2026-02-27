"use client";

import { useMemo, useState } from "react";
import { useListApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { FiltersBar } from "@/components/filters-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ProxyRow = {
  id: string;
  address: string;
  username?: string | null;
  password?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  updated_at?: string | null;
};

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

function maskUsername(u: string | null | undefined): string {
  if (!u) return "—";
  if (u.length <= 2) return "***";
  return u.slice(0, 2) + "***";
}

export function ProxiesContent() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedFilter, setAssignedFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerRaw, setRegisterRaw] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);
  const [autoAssignLoading, setAutoAssignLoading] = useState(false);

  const proxiesUrl = useMemo(
    () =>
      "/api/proxies" +
      buildQuery({
        page,
        pageSize: 20,
        q: search.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        assigned:
          assignedFilter === "all"
            ? undefined
            : assignedFilter === "yes"
              ? "true"
              : "false",
      }),
    [page, search, statusFilter, assignedFilter],
  );

  const {
    list: proxies,
    total,
    error,
    isLoading,
    mutate,
  } = useListApi<ProxyRow>(proxiesUrl);

  const columns = useMemo<ColumnDef<ProxyRow>[]>(
    () => [
      {
        id: "address",
        header: "주소 (IP:PORT)",
        accessorKey: "address",
        cell: (c) => c.getValue() ?? "—",
      },
      {
        id: "username",
        header: "사용자",
        accessorKey: "username",
        cell: (c) => maskUsername(c.getValue() as string),
      },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant="secondary">{v}</Badge> : "—";
        },
      },
      {
        id: "assigned_to",
        header: "할당 디바이스",
        accessorKey: "assigned_to",
        cell: (c) => c.getValue() ?? "—",
      },
      {
        id: "updated_at",
        header: "수정일",
        accessorKey: "updated_at",
        cell: (c) => formatDate(c.getValue() as string),
      },
    ],
    [],
  );

  const handleRegisterSubmit = async () => {
    const raw = registerRaw.trim();
    if (!raw) {
      toast.error("한 줄 이상 입력하세요 (형식: IP:PORT:ID:PW)");
      return;
    }
    setRegisterLoading(true);
    try {
      const res = await fetch("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json as { ok?: boolean }).ok === false) {
        const msg =
          (json as { message?: string }).message ??
          (json as { error?: string }).error ??
          "등록 실패";
        toast.error(msg);
        return;
      }
      const payload = (
        json as { data?: { created?: number; data?: unknown[] } }
      ).data;
      const count =
        typeof payload?.created === "number"
          ? payload.created
          : Array.isArray(payload?.data)
            ? payload.data.length
            : 1;
      toast.success(`${count}개 프록시가 등록되었습니다.`);
      setRegisterRaw("");
      setRegisterOpen(false);
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    setAutoAssignLoading(true);
    try {
      const res = await fetch("/api/proxies/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || (json as { ok?: boolean }).ok === false) {
        const msg =
          (json as { message?: string }).message ??
          (json as { error?: string }).error ??
          "자동할당 실패";
        toast.error(msg);
        return;
      }
      const data = (json as { data?: { assigned?: number } }).data;
      const n = data?.assigned ?? 0;
      toast.success(
        `자동할당 완료: ${n}개 디바이스에 프록시가 배정되었습니다.`,
      );
      setAutoAssignOpen(false);
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "자동할당 실패");
    } finally {
      setAutoAssignLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setRegisterOpen(true)}>
          프록시 등록
        </Button>
        <Button onClick={() => setAutoAssignOpen(true)}>자동할당</Button>
      </div>
      <FiltersBar
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        searchPlaceholder="주소 검색"
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">상태: 전체</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={assignedFilter}
              onChange={(e) => {
                setAssignedFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">할당: 전체</option>
              <option value="yes">할당됨</option>
              <option value="no">미할당</option>
            </select>
          </div>
        }
      />
      <DataTable<ProxyRow>
        data={proxies}
        columns={columns}
        searchPlaceholder="검색…"
        loading={isLoading}
        error={error ?? null}
        emptyTitle="프록시 없음"
        emptyDescription="프록시를 등록하거나 자동할당을 실행하세요."
      />
      {total > 0 && (
        <p className="text-sm text-muted-foreground">
          총 {total}개 (페이지 {page})
        </p>
      )}

      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프록시 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>한 줄에 하나씩 입력 (형식: IP:PORT:ID:PW)</Label>
            <Textarea
              placeholder="1.2.3.4:8080:myuser:mypass"
              value={registerRaw}
              onChange={(e) => setRegisterRaw(e.target.value)}
              rows={6}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>
              취소
            </Button>
            <Button onClick={handleRegisterSubmit} disabled={registerLoading}>
              {registerLoading ? "등록 중…" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>자동할당</AlertDialogTitle>
            <AlertDialogDescription>
              미할당 디바이스에 미할당 프록시를 1:1로 배정하고, set_proxy 명령을
              큐에 넣습니다. 계속할까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoAssignLoading}>
              취소
            </AlertDialogCancel>
            <Button onClick={handleAutoAssign} disabled={autoAssignLoading}>
              {autoAssignLoading ? "실행 중…" : "실행"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
