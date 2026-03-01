import { PageHeader } from "@/components/page-header";
import { ChannelsContent } from "./channels-content";

export default function ChannelsPage() {
  return (
    <>
      <PageHeader title="채널 관리" description="YouTube 채널 목록" />
      <ChannelsContent />
    </>
  );
}
