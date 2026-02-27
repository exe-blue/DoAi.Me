import { PageHeader } from "@/components/page-header";
import { NetworkContent } from "./network-content";

export default function NetworkPage() {
  return (
    <>
      <PageHeader title="네트워크" description="프록시 · 디바이스 · 연결 상태 시각화" />
      <NetworkContent />
    </>
  );
}
