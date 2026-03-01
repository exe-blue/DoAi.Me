import { create } from "zustand";
import type { Channel, Content } from "@/lib/types";

interface ChannelsState {
  channels: Channel[];
  contents: Content[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useChannelsStore = create<ChannelsState>((set) => ({
  channels: [],
  contents: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/channels");
      if (!res.ok) throw new Error("Failed to fetch channels");
      const data = (await res.json()) as {
        channels: Channel[];
        contents: Content[];
      };
      set({
        channels: data.channels,
        contents: data.contents,
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
}));
