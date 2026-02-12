import { z } from "zod";

// Channel validation - accepts URL or handle
export const channelCreateSchema = z.object({
  youtubeUrl: z.string().min(1, "YouTube URL or handle is required"),
});

// Preset schemas
export const presetCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  type: z.string().min(1, "Type is required"),
  description: z.string().max(500, "Description too long").optional(),
  config: z.record(z.unknown()),
});

export const presetUpdateSchema = presetCreateSchema.partial();

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

export const taskUpdateSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
  status: z.enum(["running", "queued", "completed", "stopped", "error"]).optional(),
  priority: z.number().int().min(0).max(10).optional(),
  result: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

// Schedule schemas
export const scheduleCreateSchema = z.object({
  channelId: z.string().uuid("Invalid channel ID"),
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  taskType: z.string().min(1, "Task type is required"),
  triggerType: z.string().min(1, "Trigger type is required"),
  triggerConfig: z.record(z.unknown()).optional(),
  deviceCount: z.number().int().min(1).max(1000).optional(),
});

export const scheduleUpdateSchema = z.object({
  id: z.string().uuid("Invalid schedule ID"),
  name: z.string().min(1).max(255).optional(),
  taskType: z.string().min(1).optional(),
  triggerType: z.string().min(1).optional(),
  triggerConfig: z.record(z.unknown()).optional(),
  deviceCount: z.number().int().min(1).max(1000).optional(),
  is_active: z.boolean().optional(),
});

// Account schemas
export const accountCreateSchema = z.object({
  email: z.string().email("Invalid email address"),
  status: z.enum(["active", "inactive", "banned"]).optional(),
  device_id: z.string().uuid("Invalid device ID").nullable().optional(),
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
