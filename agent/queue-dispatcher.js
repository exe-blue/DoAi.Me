/**
 * QueueDispatcher — Dispatches queued tasks to the system (Push-based)
 *
 * Primary: Supabase Realtime on task_queue INSERT → immediate dispatch.
 * Fallback: 10-second poll for any missed events.
 */

const DEFAULT_DISPATCH_INTERVAL = 10000;

class QueueDispatcher {
  constructor(supabaseSync, config, broadcaster) {
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.broadcaster = broadcaster;
    this.supabase = supabaseSync.supabase;

    this._dispatchInterval = null;
    this._running = false;
    this._lastQueueSize = -1;
    this._queueChannel = null;
  }

  start() {
    if (this._dispatchInterval) return;

    const interval = DEFAULT_DISPATCH_INTERVAL;
    this._dispatchInterval = setInterval(() => this._tick(), interval);
    this._tick();
    this._subscribeToQueue();

    console.log(`[QueueDispatcher] Started (Realtime push + ${interval / 1000}s fallback)`);
  }

  stop() {
    if (this._dispatchInterval) {
      clearInterval(this._dispatchInterval);
      this._dispatchInterval = null;
    }
    if (this._queueChannel) {
      this.supabase.removeChannel(this._queueChannel);
      this._queueChannel = null;
    }
    console.log("[QueueDispatcher] Stopped");
  }

  /**
   * Realtime: task_queue INSERT with status='queued' → immediate dispatch
   */
  _subscribeToQueue() {
    this._queueChannel = this.supabase
      .channel("qd-queue-push")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "task_queue",
        filter: "status=eq.queued",
      }, () => {
        console.log("[QueueDispatcher] ⚡ Realtime: new queue item → immediate dispatch");
        this._tick();
      })
      .subscribe((status) => {
        console.log(`[QueueDispatcher] task_queue Realtime: ${status}`);
      });
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

      const maxConcurrent = this.config.maxConcurrentTasks ?? 10;
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

      // 3. Dequeue items (target_worker NULL만 — 지정 PC 항목은 해당 Agent가 Realtime으로 수신)
      const { data: queueItems, error: dequeueErr } = await this.supabase
        .from("task_queue")
        .select("*")
        .eq("status", "queued")
        .is("target_worker", null)
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
      ...(taskConfig.pcId || taskConfig.pc_id
        ? { pc_id: taskConfig.pcId || taskConfig.pc_id }
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
