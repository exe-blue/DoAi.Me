"use client";

import { useEffect } from "react";
import { useWorkersStore } from "@/hooks/use-workers-store";
import { DevicesPage } from "@/components/devices-page";

export default function DevicesRoutePage() {
  const { nodes, fetch: fetchWorkers } = useWorkersStore();

  useEffect(() => {
    fetchWorkers();
  }, [fetchWorkers]);

  return <DevicesPage nodes={nodes} />;
}
