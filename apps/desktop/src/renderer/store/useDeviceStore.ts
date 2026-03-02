import { create } from "zustand";

interface DeviceStore {
  devices: Device[];
  lastUpdateTime: number;
  setDevices: (devices: Device[]) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  lastUpdateTime: 0,
  setDevices: (devices) => set({ devices, lastUpdateTime: Date.now() }),
}));
