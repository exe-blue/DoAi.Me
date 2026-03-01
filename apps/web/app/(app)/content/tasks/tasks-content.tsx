"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useListApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { DetailSheet } from "@/components/detail-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type Task = {
  id?: string;
  title?: string;
  status?: string;
  createdAt?: string;
  priority?: number;
  source?: string;
};

type QueueItem = {
  id?: string;
  priority?: number | null;
  status?: string | null;
  created_at?: string | null;
  source?: string | null;
};

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
}

export function TasksContent() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "queue" ? "queue" : "tasks";
  const [tasksPage, setTasksPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const [detailTask, setDetailTask] = useState<Task | QueueItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const tasksUrl = "/api/tasks" + buildQuery({ page: tasksPage, pageSize: 20 });
  const queueUrl = "/api/queue" + buildQuery({ page: queuePage, pageSize: 20 });

  const { list: tasks, error: tasksError, isLoading: tasksLoading } = useListApi<Task>(tasksUrl);
  const { list: queueItems, error: queueError, isLoading: queueLoading } = useListApi<QueueItem>(queueUrl);

  const taskColumns = useMemo<ColumnDef<Task>[]>(
    () => [
      { id: "task_name", header: "작업명", accessorKey: "title", cell: (c) => c.getValue() ?? "—" },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant="secondary">{v}</Badge> : "—";
        },
      },
      { id: "created_at", header: "생성일", accessorKey: "createdAt", cell: (c) => formatDate(c.getValue() as string) },
      { id: "pc_id", header: "PC ID", cell: () => "—" },
    ],
    []
  );

  const queueColumns = useMemo<ColumnDef<QueueItem>[]>(
    () => [
      { id: "priority", header: "우선순위", accessorKey: "priority", cell: (c) => c.getValue() ?? "—" },
      {
        id: "status",
        header: "상태",
        accessorKey: "status",
        cell: (c) => {
          const v = c.getValue() as string | undefined;
          return v ? <Badge variant="secondary">{v}</Badge> : "—";
        },
      },
      { id: "created_at", header: "생성일", accessorKey: "created_at", cell: (c) => formatDate(c.getValue() as string) },
    ],
    []
  );

  const openDetail = (row: Task | QueueItem) => {
    setDetailTask(row);
    setSheetOpen(true);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="queue">Queue</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks" className="mt-4">
          <DataTable<Task>
            data={tasks}
            columns={taskColumns}
            searchPlaceholder="작업 검색…"
            onRowClick={openDetail}
            loading={tasksLoading}
            error={tasksError ?? null}
            emptyTitle="작업 없음"
            emptyDescription="등록된 작업이 없습니다."
          />
        </TabsContent>
        <TabsContent value="queue" className="mt-4">
          <DataTable<QueueItem>
            data={queueItems}
            columns={queueColumns}
            searchPlaceholder="대기열 검색…"
            onRowClick={openDetail}
            loading={queueLoading}
            error={queueError ?? null}
            emptyTitle="대기열 없음"
            emptyDescription="대기 중인 항목이 없습니다."
          />
        </TabsContent>
      </Tabs>
      <DetailSheet open={sheetOpen} onOpenChange={setSheetOpen} title="상세">
        <pre className="rounded bg-muted p-3 text-xs overflow-auto">
          {detailTask ? JSON.stringify(detailTask, null, 2) : ""}
        </pre>
      </DetailSheet>
    </div>
  );
}
