import { PageHeader } from "@/components/page-header";
import { DashboardContent } from "./dashboard-content";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="대시보드"
        description="전체 현황 및 최근 상태"
      />
      <DashboardContent />
    </>
  );
}
