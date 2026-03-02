/**
 * DoAi.Me - Stale Task Cleaner
 * Recovers tasks stuck in 'running' status after agent crash/restart.
 * Runs on startup (cold start recovery) and periodically (timeout detection).
 */

class StaleTaskCleaner {
  constructor(supabaseSync, config) {
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.checkInterval = null;
    this.STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
    this.CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Recover tasks stuck in 'running' from a previous crash.
   * Called once on agent startup (cold start recovery).
   * @returns {Promise<number>} number of recovered tasks
   */
  async recoverStaleTasks() {
    const pcId = this.supabaseSync.pcUuid;
    if (!pcId) {
      console.warn('[StaleTaskCleaner] No pcId — skipping recovery');
      return 0;
    }

    // Find all tasks stuck in 'running' for this worker
    const { data: staleTasks, error } = await this.supabaseSync.supabase
      .from('tasks')
      .select('*')
      .eq('status', 'running')
      .eq('pc_id', pcId);

    if (error) {
      console.error(`[StaleTaskCleaner] Failed to query stale tasks: ${error.message}`);
      return 0;
    }

    if (!staleTasks || staleTasks.length === 0) {
      console.log('[StaleTaskCleaner] No stale tasks found');
      return 0;
    }

    const now = Date.now();
    const staleIds = [];

    for (const task of staleTasks) {
      const startedAt = task.started_at ? new Date(task.started_at).getTime() : 0;
      // If started more than 30 minutes ago, or no started_at, consider stale
      if (!task.started_at || (now - startedAt) > this.STALE_THRESHOLD_MS) {
        staleIds.push(task.id);
      }
    }

    if (staleIds.length === 0) {
      console.log('[StaleTaskCleaner] No tasks exceed stale threshold');
      return 0;
    }

    // Mark stale tasks as 'failed'
    const { error: updateErr } = await this.supabaseSync.supabase
      .from('tasks')
      .update({
        status: 'failed',
        error: 'Agent crash recovery — task was running when agent restarted',
        updated_at: new Date().toISOString(),
      })
      .in('id', staleIds);

    if (updateErr) {
      console.error(`[StaleTaskCleaner] Failed to update stale tasks: ${updateErr.message}`);
      return 0;
    }

    // Also fail any running task_devices for these tasks
    const { error: deviceErr } = await this.supabaseSync.supabase
      .from('task_devices')
      .update({
        status: 'failed',
        error: 'Agent restarted during execution',
      })
      .in('task_id', staleIds)
      .eq('status', 'running');

    if (deviceErr) {
      console.error(`[StaleTaskCleaner] Failed to update task_devices: ${deviceErr.message}`);
    }

    console.log(`[StaleTaskCleaner] Recovered ${staleIds.length} stale task(s): ${staleIds.join(', ')}`);

    // Publish system event
    await this._publishEvent('stale_task_recovered', {
      count: staleIds.length,
      taskIds: staleIds,
      pcId,
    });

    return staleIds.length;
  }

  /**
   * Start periodic check for tasks and task_devices timeout (Rule I).
   * task_devices: status='running' AND lease_expires_at < now() → failed, error='timeout', attempt += 1.
   * Final failure (attempt >= max_attempts): update devices.status='error', total_errors += 1.
   */
  startPeriodicCheck() {
    this.checkInterval = setInterval(() => {
      this._periodicCheck();
      this._periodicTaskDevicesTimeout();
    }, this.CHECK_INTERVAL_MS);
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
    console.log(`[StaleTaskCleaner] Periodic check started (${this.CHECK_INTERVAL_MS / 1000}s interval)`);
  }

  /**
   * Stop periodic checking.
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Periodic check: find tasks running > 2x stale threshold and mark as 'timeout'.
   */
  async _periodicCheck() {
    const pcId = this.supabaseSync.pcUuid;
    if (!pcId) return;

    try {
      const { data: runningTasks, error } = await this.supabaseSync.supabase
        .from('tasks')
        .select('id, started_at')
        .eq('status', 'running')
        .eq('pc_id', pcId);

      if (error || !runningTasks) return;

      const now = Date.now();
      const timeoutThreshold = this.STALE_THRESHOLD_MS * 2; // 60 minutes
      const timeoutIds = [];

      for (const task of runningTasks) {
        if (!task.started_at) continue;
        const elapsed = now - new Date(task.started_at).getTime();
        if (elapsed > timeoutThreshold) {
          timeoutIds.push(task.id);
        }
      }

      if (timeoutIds.length === 0) return;

      const { error: updateErr } = await this.supabaseSync.supabase
        .from('tasks')
        .update({
          status: 'timeout',
          error: `Task exceeded maximum runtime (${Math.round(timeoutThreshold / 60000)} minutes)`,
          updated_at: new Date().toISOString(),
        })
        .in('id', timeoutIds);

      if (updateErr) {
        console.error(`[StaleTaskCleaner] Periodic timeout update failed: ${updateErr.message}`);
        return;
      }

      console.log(`[StaleTaskCleaner] Timed out ${timeoutIds.length} task(s): ${timeoutIds.join(', ')}`);

      await this._publishEvent('task_timeout', {
        count: timeoutIds.length,
        taskIds: timeoutIds,
        pcId,
      });
    } catch (err) {
      console.error(`[StaleTaskCleaner] Periodic check error: ${err.message}`);
    }
  }

  /**
   * Rule I: Timeout task_devices (running + lease_expires_at < now). No schema change.
   * Set status='failed', error='timeout', attempt += 1. On attempt >= max_attempts, mark device error.
   */
  async _periodicTaskDevicesTimeout() {
    try {
      const now = new Date().toISOString();
      const { data: rows, error: selectErr } = await this.supabaseSync.supabase
        .from('task_devices')
        .select('id, device_id, attempt, max_attempts')
        .eq('status', 'running')
        .lt('lease_expires_at', now)
        .is('completed_at', null);

      if (selectErr || !rows || rows.length === 0) return;

      for (const row of rows) {
        const nextAttempt = (row.attempt ?? 0) + 1;
        const { error: updateErr } = await this.supabaseSync.supabase
          .from('task_devices')
          .update({
            status: 'failed',
            error: 'timeout',
            attempt: nextAttempt,
            completed_at: now,
            lease_expires_at: null,
            updated_at: now,
          })
          .eq('id', row.id)
          .eq('status', 'running');

        if (updateErr) {
          console.error(`[StaleTaskCleaner] task_device timeout update failed: ${updateErr.message}`);
          continue;
        }

        if (row.device_id && nextAttempt >= (row.max_attempts ?? 3)) {
          const { data: devRow } = await this.supabaseSync.supabase
            .from('devices')
            .select('total_errors')
            .eq('id', row.device_id)
            .single();
          const nextTotalErrors = (devRow?.total_errors ?? 0) + 1;
          const { error: devErr } = await this.supabaseSync.supabase
            .from('devices')
            .update({
              status: 'error',
              total_errors: nextTotalErrors,
              updated_at: now,
            })
            .eq('id', row.device_id);
          if (devErr) {
            console.warn(`[StaleTaskCleaner] devices status update (final failure) failed: ${devErr.message}`);
          }
        }
      }
    } catch (err) {
      console.error(`[StaleTaskCleaner] _periodicTaskDevicesTimeout error: ${err.message}`);
    }
  }

  /**
   * Publish a system event via Supabase Broadcast.
   * @param {string} type - Event type
   * @param {object} data - Event payload
   */
  async _publishEvent(type, data) {
    try {
      const channel = this.supabaseSync.supabase.channel('room:system');
      await channel.send({
        type: 'broadcast',
        event: 'event',
        payload: { type, data, timestamp: new Date().toISOString() },
      });
      this.supabaseSync.supabase.removeChannel(channel);
    } catch (err) {
      console.error(`[StaleTaskCleaner] Failed to publish event: ${err.message}`);
    }
  }
}

module.exports = StaleTaskCleaner;
