import { PageHeader } from "@/components/page-header";
import { DevicesContent } from "./devices-content";

export default function DevicesPage() {
  return (
    <>
      <PageHeader
        title="디바이스"
        description="연결된 디바이스 목록 및 상태"
      />
      <DevicesContent />
    </>
  );
}
