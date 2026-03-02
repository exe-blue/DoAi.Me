import { create } from "zustand";

const MAX_ALERTS = 100;

interface AlertStore {
  alerts: AlertItem[];
  addAlert: (alert: AlertItem) => void;
  removeAlert: (id: string) => void;
  clearAlerts: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  addAlert: (alert) =>
    set((s) => {
      // Deduplicate by id
      if (s.alerts.some((a) => a.id === alert.id)) return s;
      const next = [alert, ...s.alerts];
      return { alerts: next.length > MAX_ALERTS ? next.slice(0, MAX_ALERTS) : next };
    }),
  removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  clearAlerts: () => set({ alerts: [] }),
}));
