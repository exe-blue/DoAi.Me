"use client";

import { MaterioTheme } from "@/layouts/MaterioTheme";
import { MaterioDashboardLayout } from "@/layouts/MaterioDashboardLayout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MaterioTheme>
      <MaterioDashboardLayout>{children}</MaterioDashboardLayout>
    </MaterioTheme>
  );
}
