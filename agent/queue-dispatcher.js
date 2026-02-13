/**
 * QueueDispatcher — Dispatches queued tasks to the system
 *
 * Runs a 10-second dispatch loop that:
 * 1. Counts currently running tasks
 * 2. If running < max_concurrent_tasks, dequeues highest-priority items
 * 3. Creates real tasks from task_config (via POST /api/tasks logic)
 * 4. Updates queue entry with dispatched_task_id + status
 * 5. Publishes system events for dashboard
 *
 * Respects config changes dynamically. Never cancels running tasks.
 */

const DEFAULT_DISPATCH_INTERVAL = 10000; // 10 seconds

class QueueDispatcher {
  /**
   * @param {object} supabaseSync - SupabaseSync instance
   * @param {object} config - AgentConfig instance
   * @param {object} broadcaster - DashboardBroadcaster instance (nullable)
   */
  constructor(supabaseSync, config, broadcaster) {
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.broadcaster = broadcaster;
    this.supabase = supabaseSync.supabase;

    this._dispatchInterval = null;
    this._running = false;
    this._lastQueueSize = -1; // Track for state-transition logging
  }

  /**
   * Start the dispatch loop
   */
  start() {
    if (this._dispatchInterval) return;

    const interval = DEFAULT_DISPATCH_INTERVAL;
    this._dispatchInterval = setInterval(() => this._tick(), interval);

    // Run first tick immediately
    this._tick();

    console.log(`[QueueDispatcher] Started (interval: ${interval}ms)`);
  }

  /**
   * Stop the dispatch loop
   */
  stop() {
    if (this._dispatchInterval) {
      clearInterval(this._dispatchInterval);
      this._dispatchInterval = null;
    }
    console.log("[QueueDispatcher] Stopped");
  }

  /**
   * Main dispatch tick
   */
  async _tick() {
    if (this._running) return; // Guard against overlapping ticks
    this._running = true;

    try {
      // 1. Count currently running tasks
      const { count: runningCount, error: countErr } = await this.supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");

      if (countErr) {
        console.error(`[QueueDispatcher] Failed to count running tasks: ${countErr.message}`);
        return;
      }

      const maxConcurrent = this.config.maxConcurrentTasks || 20;
      const available = Math.max(0, maxConcurrent - (runningCount || 0));

      // 2. Check queue size for state-transition logging
      const { count: queueSize } = await this.supabase
        .from("task_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued");

      const currentQueueSize = queueSize || 0;

      // Only log on state transitions (not every tick)
      if (currentQueueSize === 0 && this._lastQueueSize > 0) {
        console.log("[QueueDispatcher] Queue empty");
      } else if (currentQueueSize > 0 && this._lastQueueSize === 0) {
        console.log(`[QueueDispatcher] Queue has ${currentQueueSize} item(s)`);
      }
      this._lastQueueSize = currentQueueSize;

      if (available === 0 || currentQueueSize === 0) return;

      // 3. Dequeue items (up to available slots)
      const { data: queueItems, error: dequeueErr } = await this.supabase
        .from("task_queue")
        .select("*")
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(available);

      if (dequeueErr) {
        console.error(`[QueueDispatcher] Failed to dequeue: ${dequeueErr.message}`);
        return;
      }

      if (!queueItems || queueItems.length === 0) return;

      // 4. Dispatch each item
      for (const item of queueItems) {
        try {
          const taskId = await this._dispatchItem(item);
          console.log(`[QueueDispatcher] Dispatched queue=${item.id} → task=${taskId} (priority=${item.priority})`);

          if (this.broadcaster) {
            await this.broadcaster.publishSystemEvent(
              "task_dispatched",
              `Queue item dispatched (priority ${item.priority})`,
              { queue_id: item.id, task_id: taskId }
            );
          }
        } catch (err) {
          console.error(`[QueueDispatcher] Failed to dispatch queue=${item.id}: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[QueueDispatcher] Tick error: ${err.message}`);
    } finally {
      this._running = false;
    }
  }

  /**
   * Dispatch a single queue item: create task from config, update queue entry
   * @param {object} item - task_queue row
   * @returns {string} task ID
   */
  async _dispatchItem(item) {
    const taskConfig = item.task_config;

    // Create task using the same insert pattern as POST /api/tasks
    const insertData = {
      video_id: taskConfig.videoId || taskConfig.video_id || null,
      channel_id: taskConfig.channelId || taskConfig.channel_id || null,
      type: taskConfig.type || "youtube",
      task_type: taskConfig.taskType || taskConfig.task_type || "view_farm",
      device_count: taskConfig.deviceCount || taskConfig.device_count || 20,
      payload: taskConfig.variables || taskConfig.payload || {
        watchPercent: 80,
        commentProb: 10,
        likeProb: 40,
        saveProb: 5,
        subscribeToggle: false,
      },
      status: "pending",
      ...(taskConfig.workerId || taskConfig.worker_id
        ? { worker_id: taskConfig.workerId || taskConfig.worker_id }
        : {}),
    };

    const { data: task, error: taskErr } = await this.supabase
      .from("tasks")
      .insert(insertData)
      .select("id")
      .single();

    if (taskErr) throw taskErr;

    // Update queue entry
    const { error: updateErr } = await this.supabase
      .from("task_queue")
      .update({
        status: "dispatched",
        dispatched_task_id: task.id,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error(`[QueueDispatcher] Failed to update queue entry: ${updateErr.message}`);
    }

    return task.id;
  }
}

module.exports = QueueDispatcher;
