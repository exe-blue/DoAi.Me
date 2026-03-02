"use client";
import type { TaskStatus } from "@/lib/types";

interface TaskDeviceGridProps {
  taskId: string;
  taskStatus: TaskStatus;
}

export function TaskDeviceGrid({ taskId: _taskId, taskStatus: _taskStatus }: TaskDeviceGridProps) {
  return null;
}
