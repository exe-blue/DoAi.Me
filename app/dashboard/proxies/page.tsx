"use client";

import { useEffect } from "react";
import { useWorkersStore } from "@/hooks/use-workers-store";
import { ProxiesPage } from "@/components/proxies-page";

export default function ProxiesRoutePage() {
  const { nodes, fetch: fetchWorkers } = useWorkersStore();

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  return <ProxiesPage nodes={nodes} />;
}
