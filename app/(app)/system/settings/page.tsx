import { PageHeader } from "@/components/page-header";
import { SettingsContent } from "./settings-content";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" description="시스템 설정" />
      <SettingsContent />
    </>
  );
}
