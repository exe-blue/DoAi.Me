import { PageHeader } from "@/components/page-header";
import { AccountsContent } from "./accounts-content";

export default function AccountsPage() {
  return (
    <>
      <PageHeader title="계정" description="계정 목록 및 관리" />
      <AccountsContent />
    </>
  );
}
