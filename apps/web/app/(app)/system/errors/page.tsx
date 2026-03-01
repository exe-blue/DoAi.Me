import { PageHeader } from "@/components/page-header";
import { ErrorsContent } from "./errors-content";

export default function ErrorsPage() {
  return (
    <>
      <PageHeader
        title="에러"
        description="최근 에러 요약 및 목록"
      />
      <ErrorsContent />
    </>
  );
}
