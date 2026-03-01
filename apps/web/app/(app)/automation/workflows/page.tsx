import { PageHeader } from "@/components/page-header";
import { WorkflowsContent } from "./workflows-content";

export default function WorkflowsPage() {
  return (
    <>
      <PageHeader title="조건별 조합된 명령" description="저장된 파일 혹은 웹 등록 · 워크플로우 정의 및 버전" />
      <WorkflowsContent />
    </>
  );
}
