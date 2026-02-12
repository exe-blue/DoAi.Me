import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerClient();

    // Workers stats
    const { count: workersTotal } = await supabase
      .from("workers")
      .select("*", { count: "exact", head: true });

    const { count: workersOnline } = await supabase
      .from("workers")
      .select("*", { count: "exact", head: true })
      .eq("status", "online");

    // Devices stats
    const { count: devicesTotal } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true });

    const { count: devicesOnline } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("status", "online");

    const { count: devicesRunning } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("status", "busy");

    const { count: devicesOffline } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("status", "offline");

    const { count: devicesError } = await supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("status", "error");

    // Tasks stats
    const { count: tasksTotal } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true });

    const { count: tasksPending } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: tasksRunning } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "running");

    const { count: tasksCompleted } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    const { count: tasksFailed } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed");

    // Channels stats
    const { count: channelsTotal } = await supabase
      .from("channels")
      .select("*", { count: "exact", head: true });

    const { count: channelsMonitoring } = await supabase
      .from("channels")
      .select("*", { count: "exact", head: true })
      .eq("monitoring_enabled", true);

    return NextResponse.json({
      workers: {
        total: workersTotal ?? 0,
        online: workersOnline ?? 0,
      },
      devices: {
        total: devicesTotal ?? 0,
        online: devicesOnline ?? 0,
        running: devicesRunning ?? 0,
        offline: devicesOffline ?? 0,
        error: devicesError ?? 0,
      },
      tasks: {
        total: tasksTotal ?? 0,
        pending: tasksPending ?? 0,
        running: tasksRunning ?? 0,
        completed: tasksCompleted ?? 0,
        failed: tasksFailed ?? 0,
      },
      channels: {
        total: channelsTotal ?? 0,
        monitoring: channelsMonitoring ?? 0,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
