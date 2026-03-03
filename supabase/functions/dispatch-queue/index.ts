import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data: claimedRows, error: claimError } = await supabase.rpc(
      "claim_dispatchable_task_queue_item",
    );
    if (claimError) throw claimError;

    const item = Array.isArray(claimedRows) && claimedRows.length > 0 ? claimedRows[0] : null;
    if (!item) {
      return Response.json({ ok: true, dispatched: 0, message: "No dispatchable queued items" });
    }

    const config = (item.task_config ?? {}) as Record<string, unknown>;
    const inputs = (config.inputs as Record<string, unknown> | undefined) ?? {};
    const videoId =
      (config.videoId as string | undefined) ??
      (inputs.videoId as string | undefined) ??
      (config.video_id as string | undefined);
    const channelId =
      (config.channelId as string | undefined) ??
      (inputs.channelId as string | undefined) ??
      (config.channel_id as string | undefined);

    if (!videoId || !channelId) {
      await supabase.from("task_queue").update({ status: "cancelled" }).eq("id", item.id);
      return Response.json({
        ok: true,
        dispatched: 0,
        message: "Cancelled",
        error: "Invalid task_config: missing videoId or channelId",
      });
    }

    const deviceCount = Number(config.deviceCount ?? 20);
    const variables = (config.variables ?? {}) as Record<string, unknown>;

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        video_id: videoId,
        channel_id: channelId,
        type: "youtube",
        task_type: "view_farm",
        device_count: Number.isFinite(deviceCount) ? deviceCount : 20,
        payload: variables,
        status: "pending",
      })
      .select("id")
      .single();

    if (taskError) throw taskError;

    await supabase
      .from("task_queue")
      .update({
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
        dispatched_task_id: task.id,
      })
      .eq("id", item.id);

    return Response.json({
      ok: true,
      dispatched: 1,
      queue_id: item.id,
      task_id: task.id,
      video_id: videoId,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Dispatch failed" },
      { status: 500 },
    );
  }
});
