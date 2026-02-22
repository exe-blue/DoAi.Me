/**
 * DoAi.Me - Command Executor
 * Listens to command_logs table via Realtime and executes ADB commands on devices via Xiaowei
 * Supports single device, device group, and all-devices targeting
 * STEP 10: ADB Command Execution Module
 */

const BLOCKED_PATTERNS = [
  /rm\s+-rf/i,
  /format\s+/i,
  /factory[_\s]?reset/i,
  /wipe\s+/i,
  /flash\s+/i,
  /dd\s+if=/i,
];

const BATCH_SIZE = 10;
const BATCH_GAP = 1000; // 1 second between batches
const DEVICE_TIMEOUT = 30000; // 30 seconds per device

class CommandExecutor {
  constructor(xiaowei, supabaseSync, config) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.config = config;
    this._channel = null;
    this._executing = false; // only one command at a time
  }

  /**
   * Subscribe to command_logs INSERT events via Realtime
   * @returns {Promise<void>}
   */
  async subscribe() {
    console.log('[CommandExecutor] Subscribing to command_logs Realtime...');

    this._channel = this.supabaseSync.supabase
      .channel('command-logs-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'command_logs',
        filter: 'status=eq.pending'
      }, (payload) => {
        this._handleNewCommand(payload.new);
      })
      .subscribe((status) => {
        console.log(`[CommandExecutor] Realtime status: ${status}`);
      });
  }

  /**
   * Handle new pending command from Realtime
   * @param {object} row - command_logs row
   */
  _handleNewCommand(row) {
    if (this._executing) {
      console.log(`[CommandExecutor] Busy executing another command, skipping ${row.id}`);
      return;
    }

    // Validate command against blocked patterns
    const isBlocked = BLOCKED_PATTERNS.some(pattern => pattern.test(row.command));
    if (isBlocked) {
      console.warn(`[CommandExecutor] Command blocked by safety filter: ${row.command}`);
      this._markCommandFailed(row.id, [{ error: 'Command blocked by safety filter' }])
        .catch(err => console.error(`[CommandExecutor] Failed to mark command as failed: ${err.message}`));
      return;
    }

    console.log(`[CommandExecutor] New command received: ${row.id} - ${row.command}`);
    this._executeCommand(row).catch(err => {
      console.error(`[CommandExecutor] Execution error: ${err.message}`);
    });
  }

  /**
   * Mark a command as failed with error results
   * @param {string} commandId
   * @param {Array} results
   * @returns {Promise<void>}
   */
  async _markCommandFailed(commandId, results) {
    try {
      await this.supabaseSync.supabase
        .from('command_logs')
        .update({
          status: 'failed',
          results,
          completed_at: new Date().toISOString()
        })
        .eq('id', commandId);
    } catch (err) {
      console.error(`[CommandExecutor] DB update failed: ${err.message}`);
    }
  }

  /**
   * Main command execution logic
   * @param {object} row - command_logs row
   * @returns {Promise<void>}
   */
  async _executeCommand(row) {
    this._executing = true;
    const startTime = Date.now();

    try {
      // 1. Update status to running
      await this.supabaseSync.supabase
        .from('command_logs')
        .update({
          status: 'running',
          pc_id: this.supabaseSync.pcId
        })
        .eq('id', row.id);

      console.log(`[CommandExecutor] Started command ${row.id}: ${row.command}`);

      // 2. Resolve target devices
      const targetSerials = await this._resolveTargetDevices(row);
      if (!targetSerials || targetSerials.length === 0) {
        throw new Error('No devices found for execution');
      }

      console.log(`[CommandExecutor] Executing on ${targetSerials.length} devices`);

      // 3. Execute command in batches
      const results = [];
      for (let i = 0; i < targetSerials.length; i += BATCH_SIZE) {
        const batch = targetSerials.slice(i, i + BATCH_SIZE);
        console.log(`[CommandExecutor] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(targetSerials.length / BATCH_SIZE)}: ${batch.length} devices`);

        const batchResults = await Promise.allSettled(
          batch.map(serial => this._executeOnDevice(serial, row.command))
        );

        for (let j = 0; j < batch.length; j++) {
          const r = batchResults[j];
          results.push({
            device_serial: batch[j],
            success: r.status === 'fulfilled' && r.value.success,
            output: r.status === 'fulfilled' ? r.value.output : null,
            error: r.status === 'rejected' ? r.reason?.message : (r.value?.error || null),
            duration_ms: r.status === 'fulfilled' ? r.value.duration_ms : 0,
          });
        }

        // Broadcast progress after each batch
        await this._broadcastProgress(row.id, results, targetSerials.length);

        // Wait between batches (except last)
        if (i + BATCH_SIZE < targetSerials.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_GAP));
        }
      }

      // 4. Mark command as completed
      const totalDuration = Date.now() - startTime;
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      await this.supabaseSync.supabase
        .from('command_logs')
        .update({
          status: 'completed',
          results,
          completed_at: new Date().toISOString()
        })
        .eq('id', row.id);

      console.log(`[CommandExecutor] ✓ Command ${row.id} completed: ${successCount} success, ${failureCount} failed, ${totalDuration}ms`);

      // 5. Final broadcast with complete results
      await this._broadcastProgress(row.id, results, targetSerials.length, true);

    } catch (err) {
      console.error(`[CommandExecutor] Execution failed for ${row.id}: ${err.message}`);

      // Mark as failed
      try {
        await this.supabaseSync.supabase
          .from('command_logs')
          .update({
            status: 'failed',
            results: [{ error: err.message }],
            completed_at: new Date().toISOString()
          })
          .eq('id', row.id);
      } catch (updateErr) {
        console.error(`[CommandExecutor] Failed to update error status: ${updateErr.message}`);
      }
    } finally {
      this._executing = false;
    }
  }

  /**
   * Execute ADB command on a single device
   * @param {string} serial - Device serial number
   * @param {string} command - ADB shell command
   * @returns {Promise<{success: boolean, output: string|null, error: string|null, duration_ms: number}>}
   */
  async _executeOnDevice(serial, command) {
    const start = Date.now();
    try {
      const response = await Promise.race([
        this.xiaowei.adbShell(serial, command),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), DEVICE_TIMEOUT)
        )
      ]);

      const output = _extractOutput(response);
      return {
        success: true,
        output,
        duration_ms: Date.now() - start
      };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: err.message,
        duration_ms: Date.now() - start
      };
    }
  }

  /**
   * Broadcast execution progress to Realtime channel
   * @param {string} commandId
   * @param {Array} results
   * @param {number} total
   * @param {boolean} isFinal
   * @returns {Promise<void>}
   */
  async _broadcastProgress(commandId, results, total, isFinal = false) {
    const completed = results.length;
    const failed = results.filter(r => !r.success).length;
    const latestBatch = results.slice(-10); // last 10 for preview

    try {
      await this.supabaseSync.supabase.rpc('broadcast_to_channel', {
        p_channel: `room:command:${commandId}`,
        p_event: isFinal ? 'complete' : 'progress',
        p_payload: {
          command_id: commandId,
          completed,
          total,
          failed,
          is_final: isFinal,
          latest_results: latestBatch.map(r => ({
            device_serial: r.device_serial,
            success: r.success,
            output_preview: (r.output || r.error || '').substring(0, 200),
          })),
        }
      });
    } catch (err) {
      console.error(`[CommandExecutor] Broadcast failed: ${err.message}`);
    }
  }

  /**
   * Resolve target devices based on command target_type and target_serials
   * @param {object} row - command_logs row
   * @returns {Promise<Array<string>>} array of device serials
   */
  async _resolveTargetDevices(row) {
    // If target_serials is provided and not empty, use it directly
    if (row.target_serials && Array.isArray(row.target_serials) && row.target_serials.length > 0) {
      console.log(`[CommandExecutor] Using ${row.target_serials.length} serials from target_serials`);
      return row.target_serials;
    }

    // If target_type is 'all', query all online devices
    if (row.target_type === 'all') {
      console.log('[CommandExecutor] Resolving all online devices from DB...');
      try {
        const { data, error } = await this.supabaseSync.supabase
          .from('devices')
          .select('serial')
          .eq('status', 'online');

        if (error) {
          console.error(`[CommandExecutor] Failed to query devices: ${error.message}`);
          return [];
        }

        const serials = (data || []).map(d => d.serial);
        console.log(`[CommandExecutor] Found ${serials.length} online devices`);
        return serials;
      } catch (err) {
        console.error(`[CommandExecutor] Device query error: ${err.message}`);
        return [];
      }
    }

    // For 'single' or 'group', target_serials should already be populated
    console.warn(`[CommandExecutor] No valid target devices found for command ${row.id}`);
    return [];
  }

  /**
   * Unsubscribe from Realtime channel
   * @returns {Promise<void>}
   */
  async unsubscribe() {
    if (this._channel) {
      await this.supabaseSync.supabase.removeChannel(this._channel);
      this._channel = null;
      console.log('[CommandExecutor] Unsubscribed from command_logs Realtime');
    }
  }
}

/**
 * Extract readable output from Xiaowei response
 * @param {*} response - Response from Xiaowei adbShell
 * @returns {string|null}
 */
function _extractOutput(response) {
  if (!response) return null;
  if (typeof response === 'string') return response.trim();

  const text = response.output || response.result || response.data || response.stdout;
  if (typeof text === 'string') return text.trim();

  if (Array.isArray(response)) return response.join('\n').trim();

  return JSON.stringify(response);
}

module.exports = CommandExecutor;
