import { AppSidebarLayout } from "@/components/app-sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppSidebarLayout>{children}</AppSidebarLayout>;
}
