import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    type PcRow = { id: string; pc_number: string | null; hostname: string | null; status: string | null; last_heartbeat: string | null };
    let workersList: Array<{ id: string; name: string; status: string; last_heartbeat: string | null }> = [];
    const { data: pcsData, error: pcsError } = await (supabase as any)
      .from("pcs")
      .select("id, pc_number, hostname, status, last_heartbeat") as { data: PcRow[] | null; error: unknown };

    if (!pcsError && pcsData?.length) {
      workersList = pcsData.map((p) => ({
        id: p.id,
        name: p.pc_number ?? p.hostname ?? "",
        status: p.status ?? "offline",
        last_heartbeat: p.last_heartbeat,
      }));
    } else {
      const { data: workersData, error: workersError } = await supabase
        .from("workers")
        .select("id, display_name, hostname, status, last_heartbeat");
      if (workersError) throw workersError;
      workersList = (workersData ?? []).map((w) => ({
        id: w.id,
        name: w.display_name ?? w.hostname ?? "",
        status: w.status ?? "offline",
        last_heartbeat: w.last_heartbeat,
      }));
    }

    const onlineWorker = workersList.find((w) => w.status === "online") ?? workersList[0] ?? null;

    const { data: devices, error: devicesError } = await supabase
      .from("devices")
      .select("status");

    if (devicesError) throw devicesError;

    const deviceCounts = {
      total: devices?.length ?? 0,
      online: devices?.filter((d) => d.status === "online").length ?? 0,
      busy: devices?.filter((d) => d.status === "busy").length ?? 0,
      error: devices?.filter((d) => d.status === "error").length ?? 0,
      offline: devices?.filter((d) =>
        ["offline", "disconnected", "idle"].includes(d.status ?? ""),
      ).length ?? 0,
    };

    const now = new Date();
    const todayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("status, completed_at")
      .or(`status.in.(running,pending,completed,done,failed),completed_at.gte.${todayUtc.toISOString()}`);

    if (tasksError) throw tasksError;

    const taskCounts = {
      running: tasks?.filter((t) => t.status === "running").length ?? 0,
      pending: tasks?.filter((t) => t.status === "pending").length ?? 0,
      completed_today:
        tasks?.filter(
          (t) =>
            (t.status === "completed" || t.status === "done") &&
            t.completed_at &&
            new Date(t.completed_at) >= todayUtc,
        ).length ?? 0,
      failed_today:
        tasks?.filter(
          (t) =>
            t.status === "failed" &&
            t.completed_at &&
            new Date(t.completed_at) >= todayUtc,
        ).length ?? 0,
    };
    const { data: proxies, error: proxiesError } = await supabase
      .from("proxies")
      .select("status, device_id");

    const proxyCounts = proxiesError
      ? { total: 0, valid: 0, invalid: 0, unassigned: 0 }
      : {
          total: proxies?.length ?? 0,
          valid:
            proxies?.filter(
              (p) => p.status === "active" || p.status === "testing",
            ).length ?? 0,
          invalid:
            proxies?.filter(
              (p) => p.status === "banned" || p.status === "inactive",
            ).length ?? 0,
          unassigned: proxies?.filter((p) => !p.device_id).length ?? 0,
        };

    return NextResponse.json({
      worker: onlineWorker
        ? {
            id: onlineWorker.id,
            name: onlineWorker.name,
            status: onlineWorker.status,
            last_heartbeat: onlineWorker.last_heartbeat,
          }
        : null,
      devices: deviceCounts,
      tasks: taskCounts,
      proxies: proxyCounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API /overview]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch overview" },
      { status: 500 },
    );
  }
}
