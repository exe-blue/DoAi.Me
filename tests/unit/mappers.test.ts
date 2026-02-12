import { describe, it, expect, vi } from "vitest";
import { mapChannelRow, mapVideoRow, mapTaskRow } from "@/lib/mappers";
import type { ChannelRow, VideoRow, TaskRow } from "@/lib/supabase/types";

// Create mock channel row data
function makeChannelRow(overrides: Partial<ChannelRow> = {}): ChannelRow {
  return {
    id: "ch-001",
    youtube_channel_id: "UC12345",
    channel_name: "Test Channel",
    channel_url: "https://www.youtube.com/@test_channel",
    thumbnail_url: "https://example.com/thumb.jpg",
    subscriber_count: 50000,
    video_count: 100,
    api_key_encrypted: null,
    monitoring_enabled: true,
    monitoring_interval_minutes: 30,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeVideoRow(overrides: Partial<VideoRow> = {}): VideoRow & { channels?: { channel_name: string } | null } {
  return {
    id: "v-001",
    channel_id: "ch-001",
    youtube_video_id: "dQw4w9WgXcQ",
    title: "Test Video",
    description: null,
    thumbnail_url: "https://example.com/video-thumb.jpg",
    published_at: "2025-01-15T10:00:00Z",
    duration_seconds: 207,
    view_count: 0,
    like_count: 0,
    status: "detected",
    auto_detected: true,
    created_at: "2025-01-15T10:30:00Z",
    updated_at: "2025-01-15T10:30:00Z",
    channels: { channel_name: "Test Channel" },
    ...overrides,
  };
}

function makeTaskRow(overrides: Partial<TaskRow> = {}): TaskRow & {
  videos?: { title: string; thumbnail_url: string | null; duration_seconds: number | null; youtube_video_id: string } | null;
  channels?: { channel_name: string } | null;
} {
  return {
    id: "t-001",
    preset_id: null,
    type: "youtube",
    status: "pending",
    priority: 5,
    payload: { watchPercent: 80, commentProb: 10, likeProb: 40, saveProb: 5, subscribeToggle: false },
    worker_id: null,
    device_serial: null,
    result: null,
    error: null,
    started_at: null,
    completed_at: null,
    created_at: "2025-01-15T12:00:00Z",
    video_id: "v-001",
    channel_id: "ch-001",
    task_type: "view_farm",
    device_count: 20,
    scheduled_at: null,
    retry_count: 0,
    max_retries: 3,
    videos: {
      title: "Test Video",
      thumbnail_url: "https://example.com/thumb.jpg",
      duration_seconds: 207,
      youtube_video_id: "dQw4w9WgXcQ",
    },
    channels: { channel_name: "Test Channel" },
    ...overrides,
  };
}

describe("mapChannelRow", () => {
  it("maps all fields correctly", () => {
    const row = makeChannelRow();
    const result = mapChannelRow(row);

    expect(result.id).toBe("ch-001");
    expect(result.name).toBe("Test Channel");
    expect(result.youtubeId).toBe("UC12345");
    expect(result.thumbnail).toBe("https://example.com/thumb.jpg");
    expect(result.videoCount).toBe(100);
    expect(result.autoSync).toBe(true);
    expect(result.addedAt).toBe("2025-01-01T00:00:00Z");
  });

  it("extracts handle from URL", () => {
    const row = makeChannelRow({ channel_url: "https://www.youtube.com/@SUPERANT_AN" });
    const result = mapChannelRow(row);
    expect(result.youtubeHandle).toBe("@SUPERANT_AN");
  });

  it("uses placeholder thumbnail when missing", () => {
    const row = makeChannelRow({ thumbnail_url: null });
    const result = mapChannelRow(row);
    expect(result.thumbnail).toBe("/placeholder-channel.jpg");
  });

  it("formats subscriber count", () => {
    const row = makeChannelRow({ subscriber_count: 50000 });
    const result = mapChannelRow(row);
    expect(result.subscriberCount).toBe("5만");
  });
});

describe("mapVideoRow", () => {
  it("maps all fields correctly", () => {
    const row = makeVideoRow();
    const result = mapVideoRow(row);

    expect(result.id).toBe("v-001");
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    expect(result.title).toBe("Test Video");
    expect(result.channelName).toBe("Test Channel");
    expect(result.taskId).toBeNull();
  });

  it("formats duration from seconds", () => {
    const row = makeVideoRow({ duration_seconds: 207 });
    const result = mapVideoRow(row);
    expect(result.duration).toBe("3:27");
  });

  it("maps detected status to pending", () => {
    const row = makeVideoRow({ status: "detected" });
    const result = mapVideoRow(row);
    expect(result.status).toBe("pending");
  });

  it("maps processing status to task_created", () => {
    const row = makeVideoRow({ status: "processing" });
    const result = mapVideoRow(row);
    expect(result.status).toBe("task_created");
  });

  it("maps completed status to completed", () => {
    const row = makeVideoRow({ status: "completed" });
    const result = mapVideoRow(row);
    expect(result.status).toBe("completed");
  });

  it("includes taskId when provided", () => {
    const row = makeVideoRow();
    const result = mapVideoRow(row, "task-123");
    expect(result.taskId).toBe("task-123");
  });

  it("generates YouTube thumbnail when thumbnail_url is null", () => {
    const row = makeVideoRow({ thumbnail_url: null });
    const result = mapVideoRow(row);
    expect(result.thumbnail).toContain("img.youtube.com/vi/dQw4w9WgXcQ");
  });

  it("formats zero duration", () => {
    const row = makeVideoRow({ duration_seconds: 0 });
    const result = mapVideoRow(row);
    expect(result.duration).toBe("0:00");
  });

  it("formats hour-long duration", () => {
    const row = makeVideoRow({ duration_seconds: 3661 });
    const result = mapVideoRow(row);
    expect(result.duration).toBe("1:01:01");
  });
});

describe("mapTaskRow", () => {
  it("maps all fields correctly", () => {
    const row = makeTaskRow();
    const result = mapTaskRow(row);

    expect(result.id).toBe("t-001");
    expect(result.title).toBe("Test Video");
    expect(result.channelName).toBe("Test Channel");
    expect(result.videoId).toBe("dQw4w9WgXcQ");
    expect(result.totalDevices).toBe(20);
  });

  it("maps pending status to queued", () => {
    const row = makeTaskRow({ status: "pending" });
    const result = mapTaskRow(row);
    expect(result.status).toBe("queued");
  });

  it("maps started status to running", () => {
    const row = makeTaskRow({ status: "started" });
    const result = mapTaskRow(row);
    expect(result.status).toBe("running");
  });

  it("maps completed status", () => {
    const row = makeTaskRow({ status: "completed" });
    const result = mapTaskRow(row);
    expect(result.status).toBe("completed");
    expect(result.progress).toBe(100);
  });

  it("maps failed status to error", () => {
    const row = makeTaskRow({ status: "failed" });
    const result = mapTaskRow(row);
    expect(result.status).toBe("error");
  });

  it("extracts variables from payload", () => {
    const row = makeTaskRow({
      payload: {
        watchPercent: 90,
        commentProb: 20,
        likeProb: 50,
        saveProb: 10,
        subscribeToggle: true,
      },
    });
    const result = mapTaskRow(row);
    expect(result.variables.watchPercent).toBe(90);
    expect(result.variables.commentProb).toBe(20);
    expect(result.variables.subscribeToggle).toBe(true);
  });

  it("uses default variables when payload is null", () => {
    const row = makeTaskRow({ payload: null });
    const result = mapTaskRow(row);
    expect(result.variables.watchPercent).toBe(80);
    expect(result.variables.likeProb).toBe(40);
  });

  it("determines isPriority from priority number", () => {
    const lowPriority = makeTaskRow({ priority: 1 });
    expect(mapTaskRow(lowPriority).isPriority).toBe(true);

    const highPriority = makeTaskRow({ priority: 10 });
    expect(mapTaskRow(highPriority).isPriority).toBe(false);
  });

  it("includes logs", () => {
    const row = makeTaskRow();
    const logs = ["2025-01-15 - Started", "2025-01-15 - Completed"];
    const result = mapTaskRow(row, logs);
    expect(result.logs).toHaveLength(2);
    expect(result.logs[0]).toBe("2025-01-15 - Started");
  });
});
