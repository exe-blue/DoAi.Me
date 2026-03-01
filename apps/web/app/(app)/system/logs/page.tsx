import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { LogsContent } from "./logs-content";

export default function LogsPage() {
  return (
    <>
      <PageHeader title="로그" description="시스템·작업 로그" />
      <Suspense>
        <LogsContent />
      </Suspense>
    </>
  );
}
