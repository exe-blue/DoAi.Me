import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase server module
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockUpsert = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockReturns = vi.fn();

function createChainMock(resolvedData: any = [], resolvedError: any = null) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError }),
  };
  // Make non-terminal methods return chain
  for (const key of ["select", "insert", "update", "delete", "upsert", "eq", "not", "order", "limit", "returns"]) {
    chain[key].mockReturnValue(chain);
  }
  // For terminal operations that don't chain
  return chain;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: mockFrom,
  }),
}));

import { getAllChannels, upsertChannel, deleteChannel, updateChannelMonitoring } from "@/lib/db/channels";
import { getVideosWithChannelName, upsertVideo, updateVideoStatus } from "@/lib/db/videos";
import { getTasksWithDetails, createTask, updateTask, deleteTask, getTaskLogs, getTaskByVideoId } from "@/lib/db/tasks";

describe("channels DB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllChannels", () => {
    it("returns channels ordered by created_at", async () => {
      const mockChannels = [
        { id: "ch-1", channel_name: "Channel A", youtube_channel_id: "UC1" },
        { id: "ch-2", channel_name: "Channel B", youtube_channel_id: "UC2" },
      ];
      const chain = createChainMock();
      // Override: getAllChannels doesn't call single(), it gets data from the chain directly
      chain.returns.mockResolvedValue({ data: mockChannels, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getAllChannels();

      expect(mockFrom).toHaveBeenCalledWith("channels");
      expect(chain.select).toHaveBeenCalledWith("*");
      expect(chain.order).toHaveBeenCalledWith("created_at", { ascending: true });
      expect(result).toEqual(mockChannels);
    });

    it("throws on error", async () => {
      const chain = createChainMock();
      chain.returns.mockResolvedValue({ data: null, error: { message: "DB error" } });
      mockFrom.mockReturnValue(chain);

      await expect(getAllChannels()).rejects.toEqual({ message: "DB error" });
    });
  });

  describe("upsertChannel", () => {
    it("upserts channel with onConflict youtube_channel_id", async () => {
      const mockChannel = { id: "ch-1", channel_name: "Test", youtube_channel_id: "UC1" };
      const chain = createChainMock(mockChannel);
      mockFrom.mockReturnValue(chain);

      const result = await upsertChannel({
        youtube_channel_id: "UC1",
        channel_name: "Test",
        channel_url: "https://youtube.com/@test",
      });

      expect(mockFrom).toHaveBeenCalledWith("channels");
      expect(chain.upsert).toHaveBeenCalled();
      const upsertArg = chain.upsert.mock.calls[0];
      expect(upsertArg[1]).toEqual({ onConflict: "youtube_channel_id" });
    });
  });

  describe("deleteChannel", () => {
    it("deletes channel by id", async () => {
      const chain = createChainMock();
      chain.eq.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await deleteChannel("ch-1");

      expect(mockFrom).toHaveBeenCalledWith("channels");
      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith("id", "ch-1");
    });
  });

  describe("updateChannelMonitoring", () => {
    it("updates monitoring_enabled", async () => {
      const mockChannel = { id: "ch-1", monitoring_enabled: false };
      const chain = createChainMock(mockChannel);
      mockFrom.mockReturnValue(chain);

      await updateChannelMonitoring("ch-1", false);

      expect(chain.update).toHaveBeenCalled();
      const updateArg = chain.update.mock.calls[0][0];
      expect(updateArg.monitoring_enabled).toBe(false);
    });

    it("updates interval when provided", async () => {
      const chain = createChainMock({ id: "ch-1" });
      mockFrom.mockReturnValue(chain);

      await updateChannelMonitoring("ch-1", true, 15);

      const updateArg = chain.update.mock.calls[0][0];
      expect(updateArg.monitoring_interval_minutes).toBe(15);
    });
  });
});

describe("videos DB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getVideosWithChannelName", () => {
    it("selects videos with channel join", async () => {
      const mockVideos = [
        { id: "v-1", title: "Video A", channels: { channel_name: "Ch A" } },
      ];
      const chain = createChainMock();
      chain.returns.mockResolvedValue({ data: mockVideos, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getVideosWithChannelName();

      expect(chain.select).toHaveBeenCalledWith("*, channels(channel_name)");
      expect(result).toEqual(mockVideos);
    });
  });

  describe("upsertVideo", () => {
    it("upserts video with onConflict youtube_video_id", async () => {
      const mockVideo = { id: "v-1", title: "Test" };
      const chain = createChainMock(mockVideo);
      mockFrom.mockReturnValue(chain);

      await upsertVideo({
        channel_id: "ch-1",
        youtube_video_id: "abc123",
        title: "Test Video",
      });

      expect(chain.upsert).toHaveBeenCalled();
      const upsertArg = chain.upsert.mock.calls[0];
      expect(upsertArg[1]).toEqual({ onConflict: "youtube_video_id" });
    });
  });

  describe("updateVideoStatus", () => {
    it("updates video status", async () => {
      const chain = createChainMock();
      chain.eq.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await updateVideoStatus("v-1", "processing");

      expect(chain.update).toHaveBeenCalled();
      const updateArg = chain.update.mock.calls[0][0];
      expect(updateArg.status).toBe("processing");
    });
  });
});

describe("tasks DB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getTasksWithDetails", () => {
    it("selects tasks with video and channel joins", async () => {
      const mockTasks = [{ id: "t-1", videos: { title: "V" }, channels: { channel_name: "C" } }];
      const chain = createChainMock();
      chain.returns.mockResolvedValue({ data: mockTasks, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getTasksWithDetails();

      expect(chain.select).toHaveBeenCalledWith(
        "*, videos(title, thumbnail_url, duration_seconds, youtube_video_id), channels(channel_name)"
      );
      expect(chain.not).toHaveBeenCalledWith("video_id", "is", null);
      expect(result).toEqual(mockTasks);
    });
  });

  describe("createTask", () => {
    it("creates task with default pending status", async () => {
      const mockTask = { id: "t-1", status: "pending" };
      const chain = createChainMock(mockTask);
      mockFrom.mockReturnValue(chain);

      const result = await createTask({
        video_id: "v-1",
        channel_id: "ch-1",
        type: "youtube",
        payload: {},
      });

      expect(chain.insert).toHaveBeenCalled();
      const insertArg = chain.insert.mock.calls[0][0];
      expect(insertArg.status).toBe("pending");
    });
  });

  describe("deleteTask", () => {
    it("deletes task by id", async () => {
      const chain = createChainMock();
      chain.eq.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      await deleteTask("t-1");

      expect(mockFrom).toHaveBeenCalledWith("tasks");
      expect(chain.delete).toHaveBeenCalled();
    });
  });

  describe("getTaskLogs", () => {
    it("returns formatted log messages", async () => {
      const mockLogs = [
        { message: "Started", created_at: "2025-01-15T10:00:00Z" },
        { message: "Completed", created_at: "2025-01-15T10:05:00Z" },
      ];
      const chain = createChainMock();
      chain.returns.mockResolvedValue({ data: mockLogs, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getTaskLogs("t-1");

      expect(result).toHaveLength(2);
      expect(result[0]).toContain("Started");
      expect(result[0]).toContain("2025-01-15T10:00:00Z");
    });

    it("handles empty logs", async () => {
      const chain = createChainMock();
      chain.returns.mockResolvedValue({ data: [], error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getTaskLogs("t-1");
      expect(result).toEqual([]);
    });
  });

  describe("getTaskByVideoId", () => {
    it("returns task id when found", async () => {
      const chain = createChainMock();
      chain.maybeSingle.mockResolvedValue({ data: { id: "t-1" }, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getTaskByVideoId("v-1");
      expect(result).toBe("t-1");
    });

    it("returns null when not found", async () => {
      const chain = createChainMock();
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getTaskByVideoId("v-999");
      expect(result).toBeNull();
    });
  });
});
