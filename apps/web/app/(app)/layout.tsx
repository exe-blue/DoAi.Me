import { MuiTheme } from "@/lib/materio-layout/MuiTheme";
import { DashboardLayout } from "@/lib/materio-layout/DashboardLayout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MuiTheme>
      <DashboardLayout>{children}</DashboardLayout>
    </MuiTheme>
  );
}
