"use client";

import { create } from "zustand";
import { useEffect } from "react";
import { useTasksBroadcast } from "@/hooks/use-realtime";
import type { Task } from "@/lib/types";
import type { TaskRow } from "@/lib/supabase/types";

interface TasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addTask: (task: Task) => void;
  updateTaskInStore: (task: Task) => void;
  removeTask: (id: string) => void;
}

function mapTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.video_title ?? "Untitled",
    channelName: row.channel_name ?? "",
    thumbnail: row.video_thumbnail ?? "",
    duration: row.video_duration ?? "0:00",
    videoId: row.video_id ?? "",
    status: (row.status as Task["status"]) || "queued",
    priority: row.priority ?? 0,
    isPriority: (row.priority ?? 0) > 0,
    assignedDevices: 0,
    totalDevices: 0,
    progress: 0,
    variables: {
      watchPercent: 80,
      commentProb: 10,
      likeProb: 40,
      saveProb: 5,
      subscribeToggle: false,
    },
    createdAt: row.created_at,
    completedAt: row.completed_at,
    logs: [],
  };
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      const { tasks } = (await res.json()) as { tasks: Task[] };
      set({ tasks, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
  addTask: (task) => {
    set((state) => ({
      tasks: [task, ...state.tasks],
    }));
  },
  updateTaskInStore: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },
  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    }));
  },
}));

/**
 * Hook that combines Zustand store + Realtime subscription
 * Use this in React components instead of useTasksStore directly
 */
export function useTasksWithRealtime() {
  const store = useTasksStore();

  useTasksBroadcast({
    onInsert: (taskRow) => {
      const task = mapTaskRow(taskRow);
      store.addTask(task);
    },
    onUpdate: (taskRow) => {
      const task = mapTaskRow(taskRow);
      store.updateTaskInStore(task);
    },
    onDelete: (taskRow) => {
      store.removeTask(taskRow.id);
    },
  });

  return store;
}
