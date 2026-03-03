import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { command, devices: devicesHint, pc_id, step_delay } = body as Record<string, any>;
    if (!command?.action || typeof command.action !== "string") {
      return Response.json({ error: "command.action (string) is required" }, { status: 400 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    let targetDevices: string[] = [];
    let devicesLabel = "";
    if (devicesHint && devicesHint !== "all") {
      targetDevices = String(devicesHint).split(",").map((s) => s.trim()).filter(Boolean);
      devicesLabel = targetDevices.join(",");
    } else if (pc_id) {
      const { data } = await supabase.from("devices").select("serial,connection_id").eq("pc_id", pc_id).in("status", ["online", "busy"]);
      targetDevices = (data ?? []).map((d: any) => d.connection_id || d.serial).filter(Boolean);
      devicesLabel = targetDevices.join(",");
    }

    if (targetDevices.length === 0) {
      return Response.json({ error: "No target devices" }, { status: 400 });
    }

    const payload = {
      devices: devicesLabel,
      script_path: "youtube_commander.js",
      cmd: {
        action: command.action,
        params: command.params ?? {},
        failStop: command.fail_stop ?? false,
      },
      step_delay: step_delay ?? 500,
    };

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({ type: "youtube", task_type: "run_script", status: "pending", payload, target_devices: targetDevices, ...(pc_id ? { pc_id } : {}) })
      .select("id,status,created_at")
      .single();

    if (error) throw error;
    return Response.json({ success: true, task_id: task.id, status: task.status, created_at: task.created_at, command: payload.cmd }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to create command task" }, { status: 500 });
  }
});
