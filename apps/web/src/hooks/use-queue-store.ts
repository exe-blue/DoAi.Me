import { create } from "zustand";

interface QueueStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

interface QueueStore {
  stats: QueueStats;
}

export const useQueueStore = create<QueueStore>(() => ({
  stats: { queued: 0, running: 0, completed: 0, failed: 0 },
}));
