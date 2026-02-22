import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const report = searchParams.get("report");

  // Simple health check (no report param)
  if (!report) {
    return Response.json({ status: "ok" });
  }

  // Full health report
  const period = (searchParams.get("period") || "24h") as "24h" | "7d" | "30d";
  const supabase = createServerClient();

  const hoursMap = { "24h": 24, "7d": 168, "30d": 720 };
  const hours = hoursMap[period] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Query tasks in period
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, status, created_at, updated_at")
    .gte("created_at", since)
    .returns<{ id: string; status: string; created_at: string; updated_at: string }[]>();

  const totalTasks = tasks?.length || 0;
  const tasksCompleted = tasks?.filter(t => t.status === "completed" || t.status === "done").length || 0;
  const tasksFailed = tasks?.filter(t => t.status === "failed").length || 0;
  const tasksTimeout = tasks?.filter(t => t.status === "timeout").length || 0;

  // Query error/fatal logs from task_logs
  const { data: errorLogs } = await supabase
    .from("task_logs")
    .select("id, level, message, created_at")
    .gte("created_at", since)
    .in("level", ["error", "fatal"])
    .returns<{ id: string; level: string; message: string; created_at: string }[]>();

  // Count specific event types from error logs
  const agentRestarts = errorLogs?.filter(l => l.message?.includes("crash recovery") || l.message?.includes("restart")).length || 0;
  const xiaoweiDisconnects = errorLogs?.filter(l => l.message?.includes("xiaowei") || l.message?.includes("Xiaowei")).length || 0;
  const staleTasksRecovered = errorLogs?.filter(l => l.message?.includes("stale") || l.message?.includes("recovered")).length || 0;

  // Device stats - current snapshot
  const { data: devices } = await supabase
    .from("devices")
    .select("id, status, last_seen")
    .returns<{ id: string; status: string; last_seen: string }[]>();

  const totalDevices = devices?.length || 0;
  const onlineDevices = devices?.filter(d => d.status === "online").length || 0;

  // Compute uptime percentage (based on ratio of completed to total tasks, simplified)
  const uptimePercent = totalTasks > 0
    ? Math.round((tasksCompleted / totalTasks) * 1000) / 10
    : 100;

  // Build hourly timeline (last 24h only for timeline). online_devices is current snapshot.
  const timelineHours = Math.min(hours, 24);
  const timeline: { hour: string; current_online_devices: number; tasks_completed: number; errors: number }[] = [];

  for (let i = timelineHours - 1; i >= 0; i--) {
    const hourStart = new Date(Date.now() - (i + 1) * 60 * 60 * 1000);
    const hourEnd = new Date(Date.now() - i * 60 * 60 * 1000);
    const hourStr = hourStart.toISOString().slice(0, 13) + ":00";

    const hourTasks = tasks?.filter(t => {
      const d = new Date(t.created_at);
      return d >= hourStart && d < hourEnd;
    }) || [];

    const hourErrors = errorLogs?.filter(l => {
      const d = new Date(l.created_at);
      return d >= hourStart && d < hourEnd;
    }) || [];

    timeline.push({
      hour: hourStr,
      current_online_devices: onlineDevices,
      tasks_completed: hourTasks.filter(t => t.status === "completed" || t.status === "done").length,
      errors: hourErrors.length,
    });
  }

  return Response.json({
    period,
    uptime_percent: uptimePercent,
    total_tasks: totalTasks,
    tasks_completed: tasksCompleted,
    tasks_failed: tasksFailed,
    tasks_timeout: tasksTimeout,
    devices_total: totalDevices,
    devices_online: onlineDevices,
    device_recoveries: 0,
    proxy_rotations: 0,
    agent_restarts: agentRestarts,
    xiaowei_disconnects: xiaoweiDisconnects,
    mass_dropouts: 0,
    stale_tasks_recovered: staleTasksRecovered,
    timeline,
    error_logs_count: errorLogs?.length || 0,
  });
}
