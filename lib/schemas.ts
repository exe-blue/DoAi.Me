import { z } from "zod";

// Preset schemas
export const presetCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  type: z.string().min(1, "Type is required"),
  description: z.string().max(500, "Description too long").optional(),
  config: z.record(z.unknown()),
});

export const presetUpdateSchema = presetCreateSchema.partial();

// Account schemas
export const accountCreateSchema = z.object({
  email: z.string().email("Invalid email address"),
  status: z.enum(["available", "in_use", "cooldown", "banned", "retired"]).optional(),
  device_id: z.string().uuid("Invalid device ID").nullable().optional(),
});

// Task schemas
export const taskCreateSchema = z.object({
  videoId: z.string().min(1, "Video ID is required"),
  channelId: z.string().uuid("Invalid channel ID"),
  workerId: z.string().uuid("Invalid worker ID").optional(),
  deviceCount: z.number().int().min(1).max(1000).optional(),
  variables: z
    .object({
      watchPercent: z.number().min(0).max(100).optional(),
      commentProb: z.number().min(0).max(100).optional(),
      likeProb: z.number().min(0).max(100).optional(),
      saveProb: z.number().min(0).max(100).optional(),
      subscribeToggle: z.boolean().optional(),
    })
    .optional(),
});

// Batch task creation schema (content-aware distribution)
export const batchTaskCreateSchema = z.object({
  contentMode: z.enum(["single", "channel", "playlist"]),
  // single mode
  videoId: z.string().uuid().optional(),
  // channel mode
  channelId: z.string().uuid().optional(),
  distribution: z.enum(["round_robin", "random", "by_priority"]).optional(),
  // playlist mode
  videoIds: z.array(z.string().uuid()).optional(),
  // common
  workerId: z.string().uuid().optional(),
  deviceCount: z.number().int().min(1).max(1000).optional(),
  variables: z
    .object({
      watchPercent: z.number().min(0).max(100).optional(),
      commentProb: z.number().min(0).max(100).optional(),
      likeProb: z.number().min(0).max(100).optional(),
      saveProb: z.number().min(0).max(100).optional(),
      subscribeToggle: z.boolean().optional(),
    })
    .optional(),
});

export const taskUpdateSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
  status: z.enum(["running", "queued", "completed", "stopped", "error"]).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

// Worker heartbeat schema
export const heartbeatSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  ip_local: z.string().ip().optional(),
  ip_public: z.string().ip().optional(),
  xiaowei_connected: z.boolean().optional(),
  devices: z
    .array(
      z.object({
        serial: z.string().min(1, "Device serial is required"),
        model: z.string().optional(),
        status: z.string().optional(),
        battery: z.number().int().min(0).max(100).optional(),
        ip_intranet: z.string().optional(),
      })
    )
    .optional(),
});
