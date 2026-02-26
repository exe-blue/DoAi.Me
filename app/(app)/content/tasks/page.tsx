import { PageHeader } from "@/components/page-header";
import { TasksContent } from "./tasks-content";

export default function TasksPage() {
  return (
    <>
      <PageHeader
        title="작업 / 대기열"
        description="작업 목록 및 대기열"
      />
      <TasksContent />
    </>
  );
}
