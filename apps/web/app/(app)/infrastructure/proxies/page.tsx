import { PageHeader } from "@/components/page-header";
import { ProxiesContent } from "./proxies-content";

export default function ProxiesPage() {
  return (
    <>
      <PageHeader
        title="프록시"
        description="프록시 등록 및 디바이스 자동할당"
      />
      <ProxiesContent />
    </>
  );
}
