import { PageHeader } from "@/components/page-header";
import { ContentContent } from "./content-content";

export default function ContentPage() {
  return (
    <>
      <PageHeader title="콘텐츠 등록" description="시청할 콘텐츠 등록" />
      <ContentContent />
    </>
  );
}
