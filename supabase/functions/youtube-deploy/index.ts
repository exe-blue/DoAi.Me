import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_SCRIPTS: Record<string, string> = {
  youtube_commander: "./scripts/youtube_commander.js",
  youtube_commander_run: "./scripts/youtube_commander_run.js",
};
const DEFAULT_REMOTE_DIR = "/sdcard/scripts/";

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return Response.json({ available_scripts: Object.keys(ALLOWED_SCRIPTS), scripts: ALLOWED_SCRIPTS, default_remote_dir: DEFAULT_REMOTE_DIR });
  }

  try {
    const body = await req.json();
    const { pc_id = null, devices: devicesHint, script_name, local_path, remote_path, deploy_all = false } = body as Record<string, any>;

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

    if (targetDevices.length === 0 && (deploy_all || script_name || local_path)) {
      return Response.json({ success: false, error: "No target devices" }, { status: 400 });
    }

    if (deploy_all) {
      const tasks = Object.values(ALLOWED_SCRIPTS).map((path) => ({
        type: "youtube",
        task_type: "upload_file",
        status: "pending",
        pc_id: pc_id || null,
        payload: { devices: devicesLabel, local_path: path, remote_path: DEFAULT_REMOTE_DIR + path.split("/").pop(), is_media: "0" },
        target_devices: targetDevices,
      }));
      const { data, error } = await supabase.from("tasks").insert(tasks).select();
      if (error) throw error;
      return Response.json({ success: true, deployed: Object.keys(ALLOWED_SCRIPTS), tasks: data });
    }

    let resolvedLocalPath = local_path;
    if (script_name) {
      resolvedLocalPath = ALLOWED_SCRIPTS[String(script_name)];
      if (!resolvedLocalPath) {
        return Response.json({ success: false, error: `Unknown script: ${script_name}`, available: Object.keys(ALLOWED_SCRIPTS) }, { status: 400 });
      }
    }
    if (!resolvedLocalPath) {
      return Response.json({ success: false, error: "script_name or local_path is required", available_scripts: Object.keys(ALLOWED_SCRIPTS) }, { status: 400 });
    }

    const fileName = String(resolvedLocalPath).split("/").pop();
    const resolvedRemotePath = remote_path || DEFAULT_REMOTE_DIR + fileName;

    const { data, error } = await supabase.from("tasks").insert({
      type: "youtube",
      task_type: "upload_file",
      status: "pending",
      pc_id: pc_id || null,
      payload: { devices: devicesLabel, local_path: resolvedLocalPath, remote_path: resolvedRemotePath, is_media: "0" },
      target_devices: targetDevices,
    }).select().single();

    if (error) throw error;
    return Response.json({ success: true, task: data, deployed: { local_path: resolvedLocalPath, remote_path: resolvedRemotePath, devices: devicesLabel, pc_id } });
  } catch (err) {
    return Response.json({ success: false, error: err instanceof Error ? err.message : "Deploy failed" }, { status: 500 });
  }
});
