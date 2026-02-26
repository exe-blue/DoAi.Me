import { PageHeader } from "@/components/page-header";
import { AdbContent } from "./adb-content";

export default function AdbPage() {
  return (
    <>
      <PageHeader title="adb 명령 파일" description="저장된 파일 혹은 웹 등록 · command_logs 기반 명령 실행 및 이력" />
      <AdbContent />
    </>
  );
}
