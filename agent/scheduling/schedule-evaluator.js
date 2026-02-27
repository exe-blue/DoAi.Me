/**
 * ScheduleEvaluator — Evaluates cron schedules and enqueues tasks
 *
 * Runs a 30-second evaluation loop that:
 * 1. Finds active schedules whose next_run_at <= now()
 * 2. Checks for overlap (schedule's tasks still queued/running)
 * 3. Inserts into task_queue
 * 4. Updates schedule's last_run_at, next_run_at, run_count
 * 5. Publishes system events
 */

const { CronExpressionParser } = require("cron-parser");

const DEFAULT_EVAL_INTERVAL = 30000; // 30 seconds

class ScheduleEvaluator {
  /**
   * @param {object} supabaseSync - SupabaseSync instance
   * @param {object} broadcaster - DashboardBroadcaster instance (nullable)
   */
  constructor(supabaseSync, broadcaster) {
    this.supabaseSync = supabaseSync;
    this.broadcaster = broadcaster;
    this.supabase = supabaseSync.supabase;

    this._evalInterval = null;
    this._running = false;
  }

  /**
   * Start the evaluation loop
   */
  start() {
    if (this._evalInterval) return;

    this._evalInterval = setInterval(() => this._tick(), DEFAULT_EVAL_INTERVAL);

    // Run first tick immediately
    this._tick();

    console.log(`[ScheduleEval] Started (interval: ${DEFAULT_EVAL_INTERVAL}ms)`);
  }

  /**
   * Stop the evaluation loop
   */
  stop() {
    if (this._evalInterval) {
      clearInterval(this._evalInterval);
      this._evalInterval = null;
    }
    console.log("[ScheduleEval] Stopped");
  }

  /**
   * Main evaluation tick
   */
  async _tick() {
    if (this._running) return;
    this._running = true;

    try {
      const now = new Date().toISOString();

      // 1. Find due schedules
      const { data: dueSchedules, error: queryErr } = await this.supabase
        .from("task_schedules")
        .select("*")
        .eq("is_active", true)
        .lte("next_run_at", now)
        .order("next_run_at", { ascending: true });

      if (queryErr) {
        console.error(`[ScheduleEval] Query failed: ${queryErr.message}`);
        return;
      }

      if (!dueSchedules || dueSchedules.length === 0) return;

      // 2. Process each due schedule
      for (const schedule of dueSchedules) {
        try {
          await this._processSchedule(schedule);
        } catch (err) {
          console.error(`[ScheduleEval] Failed to process schedule "${schedule.name}": ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`[ScheduleEval] Tick error: ${err.message}`);
    } finally {
      this._running = false;
    }
  }

  /**
   * Process a single due schedule
   * @param {object} schedule - task_schedules row
   */
  async _processSchedule(schedule) {
    // Overlap prevention: check if this schedule has tasks still queued or running
    const hasOverlap = await this._checkOverlap(schedule.id);
    if (hasOverlap) {
      console.warn(`[ScheduleEval] Schedule "${schedule.name}" skipped — previous run still active`);
      // Still advance next_run_at so it doesn't fire again immediately
      await this._advanceSchedule(schedule);
      return;
    }

    // Insert into task_queue
    const { data: queueEntry, error: insertErr } = await this.supabase
      .from("task_queue")
      .insert({
        task_config: {
          ...schedule.task_config,
          _schedule_id: schedule.id, // Tag for overlap detection
        },
        priority: 0, // Scheduled tasks get default priority
        status: "queued",
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    console.log(`[ScheduleEval] Schedule "${schedule.name}" → queue=${queueEntry.id}`);

    // Update schedule metadata
    await this._advanceSchedule(schedule);

    // Publish event
    if (this.broadcaster) {
      await this.broadcaster.publishSystemEvent(
        "schedule_triggered",
        `Schedule "${schedule.name}" triggered`,
        { schedule_id: schedule.id, queue_id: queueEntry.id }
      );
    }
  }

  /**
   * Advance schedule's next_run_at and increment run_count
   * @param {object} schedule - task_schedules row
   */
  async _advanceSchedule(schedule) {
    const nextRunAt = ScheduleEvaluator.computeNextRun(schedule.cron_expression);

    const { error } = await this.supabase
      .from("task_schedules")
      .update({
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt,
        run_count: (schedule.run_count || 0) + 1,
      })
      .eq("id", schedule.id);

    if (error) {
      console.error(`[ScheduleEval] Failed to advance schedule "${schedule.name}": ${error.message}`);
    }
  }

  /**
   * Check if a schedule has any tasks still queued or running (overlap detection)
   * Looks for queue entries with this schedule's ID that are still queued,
   * or dispatched tasks that are still running.
   * @param {string} scheduleId
   * @returns {boolean} true if overlap exists
   */
  async _checkOverlap(scheduleId) {
    // Check for queued items from this schedule
    const { count: queuedCount } = await this.supabase
      .from("task_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .contains("task_config", { _schedule_id: scheduleId });

    if (queuedCount && queuedCount > 0) return true;

    // Check for dispatched items whose tasks are still running
    const { data: dispatched } = await this.supabase
      .from("task_queue")
      .select("dispatched_task_id")
      .eq("status", "dispatched")
      .contains("task_config", { _schedule_id: scheduleId })
      .not("dispatched_task_id", "is", null);

    if (dispatched && dispatched.length > 0) {
      const taskIds = dispatched.map((d) => d.dispatched_task_id).filter(Boolean);
      if (taskIds.length > 0) {
        const { count: runningCount } = await this.supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .in("id", taskIds)
          .in("status", ["pending", "running"]);

        if (runningCount && runningCount > 0) return true;
      }
    }

    return false;
  }

  /**
   * Compute next_run_at from a cron expression
   * @param {string} cronExpr - Standard 5-field cron expression
   * @returns {string} ISO timestamp of next occurrence
   */
  static computeNextRun(cronExpr) {
    try {
      const interval = CronExpressionParser.parse(cronExpr, { tz: "UTC" });
      return interval.next().toISOString();
    } catch (err) {
      console.error(`[ScheduleEval] Invalid cron "${cronExpr}": ${err.message}`);
      // Fallback: 1 hour from now
      return new Date(Date.now() + 3600000).toISOString();
    }
  }

  /**
   * Validate a cron expression
   * @param {string} cronExpr
   * @returns {{ valid: boolean, error?: string }}
   */
  static validateCron(cronExpr) {
    try {
      CronExpressionParser.parse(cronExpr);
      return { valid: true };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

module.exports = ScheduleEvaluator;
