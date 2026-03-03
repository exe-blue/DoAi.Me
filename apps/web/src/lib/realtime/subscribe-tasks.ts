/**
 * Subscribe to room:tasks for realtime task list updates (insert/update).
 */
import { createBrowserClient } from "@/lib/supabase/client";

const CHANNEL_TASKS = "room:tasks";

export type TaskRecord = Record<string, unknown> & {
  id?: string;
  status?: string;
  created_at?: string | null;
  completed_at?: string | null;
  priority?: number | null;
  payload?: unknown;
  result?: unknown;
  device_count?: number | null;
  video_id?: string | null;
  title?: string | null;
};

export type TaskInsertUpdateCallback = (record: TaskRecord, event: "insert" | "update") => void;

export interface SubscribeTasksOptions {
  onInsert: (record: TaskRecord) => void;
  onUpdate: (record: TaskRecord) => void;
}

export interface RealtimeTasksSubscription {
  unsubscribe: () => Promise<void>;
}

/**
 * Subscribe to room:tasks (broadcast events "insert" and "update" with payload.record).
 */
export function subscribeTasks(options: SubscribeTasksOptions): RealtimeTasksSubscription | null {
  const supabase = createBrowserClient();
  if (!supabase) return null;

  const channel = supabase.channel(CHANNEL_TASKS);
  channel.on(
    "broadcast",
    { event: "insert" },
    ({ payload }: { payload?: { record?: TaskRecord } }) => {
      const record = payload?.record;
      if (record && record.id) options.onInsert(record as TaskRecord);
    }
  );
  channel.on(
    "broadcast",
    { event: "update" },
    ({ payload }: { payload?: { record?: TaskRecord } }) => {
      const record = payload?.record;
      if (record && record.id) options.onUpdate(record as TaskRecord);
    }
  );
  channel.subscribe(() => {});

  return {
    async unsubscribe() {
      await supabase.removeChannel(channel);
    },
  };
}
