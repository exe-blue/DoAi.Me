/**
 * Subscribe to room:devices for realtime device grid updates per worker.
 */
import { createBrowserClient } from "@/lib/supabase/client";
import type { DevicesUpdatePayload } from "./types";

const CHANNEL_DEVICES = "room:devices";

export type RealtimeDeviceItem = {
  serial: string;
  status?: string;
  model?: string;
  battery?: number | null;
};

export type DevicesByWorker = Map<string, RealtimeDeviceItem[]>;

export type DevicesUpdateCallback = (workerId: string, devices: RealtimeDeviceItem[]) => void;

export interface SubscribeDevicesOptions {
  onUpdate: DevicesUpdateCallback;
}

export interface RealtimeDevicesSubscription {
  unsubscribe: () => Promise<void>;
  getState: () => DevicesByWorker;
}

/**
 * Subscribe to room:devices (broadcast event "update" with { worker_id, devices }).
 */
export function subscribeDevices(options: SubscribeDevicesOptions): RealtimeDevicesSubscription | null {
  const supabase = createBrowserClient();
  if (!supabase) return null;

  const byWorker = new Map<string, RealtimeDeviceItem[]>();

  const channel = supabase.channel(CHANNEL_DEVICES);
  channel.on(
    "broadcast",
    { event: "update" },
    ({ payload }: { payload: DevicesUpdatePayload }) => {
      const workerId = payload?.worker_id;
      const devices = payload?.devices ?? [];
      if (workerId) {
        byWorker.set(workerId, devices);
        options.onUpdate(workerId, devices);
      }
    }
  );
  channel.subscribe(() => {});

  return {
    async unsubscribe() {
      await supabase.removeChannel(channel);
    },
    getState: () => new Map(byWorker),
  };
}
