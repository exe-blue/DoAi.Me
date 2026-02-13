"use client";

import { useEffect } from "react";
import { useTasksStore } from "@/hooks/use-tasks-store";
import { useWorkersStore } from "@/hooks/use-workers-store";
import { TasksPage } from "@/components/tasks-page";

export default function TasksRoutePage() {
  const { tasks, fetch: fetchTasks } = useTasksStore();
  const { nodes, fetch: fetchWorkers } = useWorkersStore();

  useEffect(() => {
    fetchTasks();
    fetchWorkers();
  }, [fetchTasks, fetchWorkers]);

  return <TasksPage tasks={tasks} nodes={nodes} />;
}
