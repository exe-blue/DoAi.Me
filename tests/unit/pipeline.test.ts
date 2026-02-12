import { describe, it, expect, vi, beforeEach } from "vitest";

// Create a sophisticated mock for supabase chaining
function createTableMock() {
  const mock: any = {
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
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return mock;
}

let tableMocks: Record<string, ReturnType<typeof createTableMock>> = {};

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (!tableMocks[table]) {
        tableMocks[table] = createTableMock();
      }
      return tableMocks[table];
    },
  }),
}));

import { processNewVideos, createManualTask } from "@/lib/pipeline";

describe("processNewVideos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableMocks = {};
  });

  it("skips videos with no channel_id", async () => {
    tableMocks.videos = createTableMock();
    tableMocks.videos.single.mockResolvedValue({
      data: { id: "v-1", channel_id: null, title: "No Channel" },
      error: null,
    });

    const result = await processNewVideos(["v-1"]);

    expect(result.createdTasks).toHaveLength(0);
    expect(result.skippedVideos).toContain("v-1");
  });

  it("skips videos with no matching schedules", async () => {
    tableMocks.videos = createTableMock();
    tableMocks.videos.single.mockResolvedValue({
      data: { id: "v-1", channel_id: "ch-1", title: "Test" },
      error: null,
    });

    tableMocks.schedules = createTableMock();
    // returns() is used with schedules; mock it to resolve with empty array
    tableMocks.schedules.returns.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await processNewVideos(["v-1"]);

    expect(result.createdTasks).toHaveLength(0);
    expect(result.skippedVideos).toContain("v-1");
  });

  it("creates task when active schedule exists", async () => {
    tableMocks.videos = createTableMock();
    tableMocks.videos.single.mockResolvedValueOnce({
      data: { id: "v-1", channel_id: "ch-1", title: "New Video" },
      error: null,
    });

    tableMocks.schedules = createTableMock();
    tableMocks.schedules.returns.mockResolvedValue({
      data: [{
        id: "s-1",
        channel_id: "ch-1",
        task_type: "view_farm",
        trigger_type: "new_video",
        device_count: 20,
        is_active: true,
        trigger_config: { watchPercent: 90 },
      }],
      error: null,
    });

    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: { id: "t-1" },
      error: null,
    });

    const result = await processNewVideos(["v-1"]);

    expect(result.createdTasks).toContain("t-1");
    expect(result.skippedVideos).toHaveLength(0);
    // Should have updated video status and schedule
    expect(tableMocks.videos.update).toHaveBeenCalled();
    expect(tableMocks.schedules.update).toHaveBeenCalled();
  });

  it("handles task creation failure gracefully", async () => {
    tableMocks.videos = createTableMock();
    tableMocks.videos.single.mockResolvedValueOnce({
      data: { id: "v-1", channel_id: "ch-1", title: "Test" },
      error: null,
    });

    tableMocks.schedules = createTableMock();
    tableMocks.schedules.returns.mockResolvedValue({
      data: [{ id: "s-1", task_type: "view_farm", device_count: 20, trigger_config: null }],
      error: null,
    });

    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });

    const result = await processNewVideos(["v-1"]);

    expect(result.createdTasks).toHaveLength(0);
    expect(result.skippedVideos).toContain("v-1");
  });

  it("processes multiple videos", async () => {
    // First video: has schedule -> creates task
    tableMocks.videos = createTableMock();
    tableMocks.videos.single
      .mockResolvedValueOnce({
        data: { id: "v-1", channel_id: "ch-1", title: "Video 1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "v-2", channel_id: "ch-2", title: "Video 2" },
        error: null,
      });

    tableMocks.schedules = createTableMock();
    tableMocks.schedules.returns
      .mockResolvedValueOnce({
        data: [{ id: "s-1", task_type: "view_farm", device_count: 20, trigger_config: {} }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });

    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: { id: "t-1" },
      error: null,
    });

    const result = await processNewVideos(["v-1", "v-2"]);

    expect(result.createdTasks).toHaveLength(1);
    expect(result.skippedVideos).toContain("v-2");
  });

  it("handles empty video list", async () => {
    const result = await processNewVideos([]);
    expect(result.createdTasks).toHaveLength(0);
    expect(result.skippedVideos).toHaveLength(0);
  });
});

describe("createManualTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableMocks = {};
  });

  it("creates task with default variables", async () => {
    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: { id: "t-1", status: "pending", device_count: 20 },
      error: null,
    });

    tableMocks.videos = createTableMock();
    tableMocks.videos.eq.mockResolvedValue({ data: null, error: null });

    const result = await createManualTask("v-1", "ch-1");

    expect(result).toEqual({ id: "t-1", status: "pending", device_count: 20 });
    expect(tableMocks.tasks.insert).toHaveBeenCalled();
    const insertArg = tableMocks.tasks.insert.mock.calls[0][0];
    expect(insertArg.video_id).toBe("v-1");
    expect(insertArg.channel_id).toBe("ch-1");
    expect(insertArg.device_count).toBe(20);
    expect(insertArg.payload).toHaveProperty("watchPercent", 80);
  });

  it("uses custom variables when provided", async () => {
    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: { id: "t-1" },
      error: null,
    });

    tableMocks.videos = createTableMock();
    tableMocks.videos.eq.mockResolvedValue({ data: null, error: null });

    await createManualTask("v-1", "ch-1", {
      deviceCount: 50,
      variables: {
        watchPercent: 95,
        commentProb: 30,
        likeProb: 60,
        saveProb: 15,
        subscribeToggle: true,
      },
    });

    const insertArg = tableMocks.tasks.insert.mock.calls[0][0];
    expect(insertArg.device_count).toBe(50);
    expect(insertArg.payload.watchPercent).toBe(95);
    expect(insertArg.payload.subscribeToggle).toBe(true);
  });

  it("updates video status to processing", async () => {
    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: { id: "t-1" },
      error: null,
    });

    tableMocks.videos = createTableMock();
    tableMocks.videos.eq.mockResolvedValue({ data: null, error: null });

    await createManualTask("v-1", "ch-1");

    expect(tableMocks.videos.update).toHaveBeenCalled();
    const updateArg = tableMocks.videos.update.mock.calls[0][0];
    expect(updateArg.status).toBe("processing");
  });

  it("throws on task creation error", async () => {
    tableMocks.tasks = createTableMock();
    tableMocks.tasks.single.mockResolvedValue({
      data: null,
      error: { message: "Insert failed" },
    });

    await expect(createManualTask("v-1", "ch-1")).rejects.toEqual({ message: "Insert failed" });
  });
});
