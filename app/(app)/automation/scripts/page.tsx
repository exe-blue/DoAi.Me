import { PageHeader } from "@/components/page-header";
import { ScriptsContent } from "./scripts-content";

export default function ScriptsPage() {
  return (
    <>
      <PageHeader title="스크립트" description="스크립트 목록 및 버전" />
      <ScriptsContent />
    </>
  );
}
