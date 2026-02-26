import { PageHeader } from "@/components/page-header";
import { ScriptsContent } from "./scripts-content";

export default function ScriptsPage() {
  return (
    <>
      <PageHeader title="js 명령 파일" description="저장된 파일 혹은 웹 등록 · 스크립트 목록 및 버전" />
      <ScriptsContent />
    </>
  );
}
