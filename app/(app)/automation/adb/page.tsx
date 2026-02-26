import { PageHeader } from "@/components/page-header";
import { AdbContent } from "./adb-content";

export default function AdbPage() {
  return (
    <>
      <PageHeader title="ADB 콘솔" description="command_logs 기반 명령 실행 및 이력" />
      <AdbContent />
    </>
  );
}
