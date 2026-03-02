import { create } from "zustand";

const MAX_LOGS = 500;

interface LogStore {
  logs: LogEntry[];
  addLog: (entry: LogEntry) => void;
  clearLogs: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((s) => {
      const next = [...s.logs, entry];
      return { logs: next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next };
    }),
  clearLogs: () => set({ logs: [] }),
}));
