import { PageHeader } from "@/components/page-header";
import { PCsContent } from "./pcs-content";

export default function PcsPage() {
  return (
    <>
      <PageHeader title="PC 관리" description="PC 목록 및 상태" />
      <PCsContent />
    </>
  );
}
