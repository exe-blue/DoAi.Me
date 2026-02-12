// Device & Node types
export type DeviceStatus = "online" | "running" | "offline" | "error";

export interface Device {
  id: string;
  serial: string;
  ip: string;
  status: DeviceStatus;
  currentTask: string | null;
  nodeId: string;
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

export interface CommandHistory {
  id: string;
  presetId: string;
  presetName: string;
  targetNode: string;
  targetDevices: string;
  executedAt: string;
  status: "success" | "failed" | "running";
}

// Task types
export type TaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "stopped"
  | "error";

export interface TaskVariables {
  watchPercent: number; // 0~100
  commentProb: number; // 0~100
  likeProb: number; // 0~100
  saveProb: number; // 0~100
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
}

// Channel & Content types
export interface Channel {
  id: string;
  name: string;
  youtubeId: string;
  thumbnail: string;
  subscriberCount: string;
  videoCount: number;
  addedAt: string;
  autoSync: boolean;
}

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
  status: "pending" | "task_created" | "completed";
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

// Settings
export interface Settings {
  concurrentTasksPerNode: number;
  executionOrder: "random" | "sequential";
}
