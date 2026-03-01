import { PageHeader } from "@/components/page-header";
import { CompletedContent } from "./completed-content";

export default function CompletedPage() {
  return (
    <>
      <PageHeader
        title="완료"
        description="오늘 완료된 작업 목록"
      />
      <CompletedContent />
    </>
  );
}
