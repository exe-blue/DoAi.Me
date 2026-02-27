import { PageHeader } from "@/components/page-header";
import { SchedulesContent } from "./schedules-content";

export default function SchedulesPage() {
  return (
    <>
      <PageHeader title="스케줄" description="스케줄 목록 및 트리거" />
      <SchedulesContent />
    </>
  );
}
