/**
 * Orchestrator data layer — task_queue and tasks CRUD only.
 * All .from() calls for task_queue/tasks used by queue-dispatcher and schedule-evaluator live here.
 * No config/logger deps to avoid bootstrap cycles.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {object} Task queue and tasks model methods
 */
function createTaskQueueModels(supabase) {
  return {
    async countRunningTasks() {
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      if (error) throw error;
      return count ?? 0;
    },

    async countQueued() {
      const { count, error } = await supabase
        .from("task_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");
      if (error) throw error;
      return count ?? 0;
    },

    async fetchQueuedItems(limit) {
      const { data, error } = await supabase
        .from("task_queue")
        .select("*")
        .eq("status", "queued")
        .is("target_worker", null)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },

    async updateDispatched(queueId, taskId) {
      const { error } = await supabase
        .from("task_queue")
        .update({
          status: "dispatched",
          dispatched_task_id: taskId,
          dispatched_at: new Date().toISOString(),
        })
        .eq("id", queueId);
      if (error) throw error;
    },

    async insertTask(insertData) {
      const { data, error } = await supabase
        .from("tasks")
        .insert(insertData)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },

    async insertQueued(entry) {
      const { data, error } = await supabase
        .from("task_queue")
        .insert(entry)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },

    async countQueuedWithScheduleTag(scheduleId) {
      const { count, error } = await supabase
        .from("task_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .contains("task_config", { _schedule_id: scheduleId });
      if (error) throw error;
      return count ?? 0;
    },

    async fetchDispatchedWithScheduleTag(scheduleId) {
      const { data, error } = await supabase
        .from("task_queue")
        .select("dispatched_task_id")
        .eq("status", "dispatched")
        .contains("task_config", { _schedule_id: scheduleId })
        .not("dispatched_task_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },

    async countRunningTasksByIds(taskIds) {
      if (!taskIds || taskIds.length === 0) return 0;
      const { count, error } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("id", taskIds)
        .in("status", ["pending", "running"]);
      if (error) throw error;
      return count ?? 0;
    },
  };
}

module.exports = { createTaskQueueModels };
