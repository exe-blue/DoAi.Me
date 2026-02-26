import { PageHeader } from "@/components/page-header";
import { WorkflowsContent } from "./workflows-content";

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader title="워크플로우" description="워크플로우 정의 및 버전" />
      <WorkflowsContent />
    </>
  );
}
