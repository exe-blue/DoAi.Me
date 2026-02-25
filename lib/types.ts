// Device & Node types
export type DeviceStatus = "online" | "running" | "offline" | "error";

export interface Device {
  id: string;
  serial: string;
  ip: string;
  status: DeviceStatus;
  currentTask: string | null;
  nodeId: string;
  nickname: string | null;
}

export interface NodePC {
  id: string;
  name: string;
  ip: string;
  status: "connected" | "disconnected";
  devices: Device[];
}

// Command Preset types
export interface CommandPreset {
  id: string;
  name: string;
  type: "adb" | "js";
  command: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// Command History
export interface CommandHistory {
  id: string;
  presetId: string;
  presetName: string;
  targetNode: string;
  targetDevices: string;
  executedAt: string;
  status: "success" | "running" | "failed";
}

// Task types
export type TaskStatus = "running" | "queued" | "completed" | "stopped" | "error";

export interface TaskVariables {
  watchPercent: number;
  commentProb: number;
  likeProb: number;
  saveProb: number;
  subscribeToggle: boolean;
}

export interface Task {
  id: string;
  title: string;
  channelName: string;
  thumbnail: string;
  duration: string;
  videoId: string;
  status: TaskStatus;
  priority: number;
  isPriority: boolean;
  assignedDevices: number;
  totalDevices: number;
  progress: number;
  variables: TaskVariables;
  createdAt: string;
  completedAt: string | null;
  logs: string[];
  /** manual = direct registration, channel_auto = channel sync */
  source?: "manual" | "channel_auto" | null;
  targetViews?: number | null;
  completedViews?: number | null;
  probLike?: number | null;
  probComment?: number | null;
  result?: {
    total?: number;
    done?: number;
    failed?: number;
    [key: string]: unknown;
  } | null;
}

// Channel types
export interface Channel {
  id: string;
  name: string;
  youtubeId: string;          // canonical YouTube channel ID (e.g. "UC...")
  youtubeHandle?: string;     // YouTube handle (e.g. "@SUPERANT_AN")
  thumbnail: string;
  subscriberCount: string;
  videoCount: number;
  addedAt: string;
  autoSync: boolean;
}

// Content types
export type ContentStatus = "pending" | "task_created" | "completed";

export interface Content {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
  channelName: string;
  publishedAt: string;
  registeredAt: string;
  taskId: string | null;
  status: ContentStatus;
  /** manual = direct registration, channel_auto = channel sync */
  source?: "manual" | "channel_auto" | null;
}

// Proxy types
export type ProxyType = "socks5" | "http" | "https";
export type ProxyStatus = "active" | "inactive" | "error" | "banned" | "testing" | "valid" | "invalid";

export interface Proxy {
  id: string;
  address: string;
  type: ProxyType;
  status: ProxyStatus;
  workerId: string | null;
  deviceId: string | null;
  failCount: number;
  createdAt: string;
}

// Log types
export type LogLevel = "info" | "warn" | "error" | "debug" | "success";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  nodeId: string;
  deviceId: string | null;
  message: string;
}
