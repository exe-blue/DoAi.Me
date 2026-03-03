"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { subscribeDevices } from "@/lib/realtime";
import type { RealtimeDeviceItem, DevicesByWorker } from "@/lib/realtime";

export interface UseRealtimeDevicesOptions {
  /** Called when a worker's device list is updated. */
  onUpdate?: (workerId: string, devices: RealtimeDeviceItem[]) => void;
}

/**
 * Subscribe to room:devices. Maintains devicesByWorker state and calls onUpdate on each update.
 */
export function useRealtimeDevices(options: UseRealtimeDevicesOptions = {}) {
  const { onUpdate } = options;
  const [devicesByWorker, setDevicesByWorker] = useState<DevicesByWorker>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const subRef = useRef<ReturnType<typeof subscribeDevices> | null>(null);

  const handleUpdate = useCallback(
    (workerId: string, devices: RealtimeDeviceItem[]) => {
      setDevicesByWorker((prev) => {
        const next = new Map(prev);
        next.set(workerId, devices);
        return next;
      });
      onUpdate?.(workerId, devices);
    },
    [onUpdate]
  );

  useEffect(() => {
    const sub = subscribeDevices({ onUpdate: handleUpdate });
    subRef.current = sub;
    return () => {
      sub?.unsubscribe().catch((err) => setError(err instanceof Error ? err : new Error(String(err))));
      subRef.current = null;
    };
  }, [handleUpdate]);

  return { devicesByWorker, setDevicesByWorker, error };
}
