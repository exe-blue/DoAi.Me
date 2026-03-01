# Agent Module I/O Contracts

Input/output contracts for every module wired into `agent.js`.
Organized by subdirectory. All modules are CommonJS.

---

## core/

Three modules exported from `agent/core/index.js`. All are plain CommonJS classes. `XiaoweiClient` extends `EventEmitter`; the other two do not.

---

### `XiaoweiClient`

**File:** `agent/core/xiaowei-client.js`

```js
/**
 * @constructor
 * @param {string} wsUrl - WebSocket URL, e.g. "ws://127.0.0.1:22222/"
 */
new XiaoweiClient(wsUrl)
```

**Dependencies:** `ws`, Node built-in `events.EventEmitter`

**Instance properties (read-only accessors):**

| Property | Type | Description |
|---|---|---|
| `isConnected` | `boolean` | Alias for `this.connected` |
| `disconnectedDuration` | `number` | Milliseconds since last disconnect; `0` if connected |

**Public methods:**

```js
// Lifecycle
connect(): void                          // Open WebSocket; auto-reconnects with exponential backoff (1s → 30s)
disconnect(): void                       // Close and suppress auto-reconnect; rejects all pending requests

// Low-level send
send(message: object, timeout?: number = 30000): Promise<object>
  // Returns { queued: true, dropped: 0|1 } when disconnected (queues up to 100 commands)
sendNoWait(message: object): void        // Fire-and-forget; throws if not connected

// Device enumeration
list(): Promise<object>                  // { action: "list" }

// Action execution
actionCreate(
  devices: string,        // comma-separated serials or "all"
  actionName: string,     // name of recorded Xiaowei action
  options?: {
    count?: number,                          // default 1
    taskInterval?: [number, number],         // default [1000, 3000] ms
    deviceInterval?: string                  // default "500" ms
  }
): Promise<object>

autojsCreate(
  devices: string,
  scriptPath: string,     // full local path to AutoJS script file
  options?: {
    count?: number,                          // default 1
    taskInterval?: [number, number],         // default [2000, 5000] ms
    deviceInterval?: string                  // default "1000" ms
  }
): Promise<object>

// ADB
adbShell(devices: string, command: string): Promise<object>   // runs without "adb" prefix
adb(devices: string, command: string): Promise<object>         // runs with "adb" prefix

// UI interaction
pointerEvent(
  devices: string,
  type: "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8",
  // 0=press 1=release 2=move 3=scroll_up 4=scroll_down
  // 5=swipe_up 6=swipe_down 7=swipe_left 8=swipe_right
  x: string|number,      // 0–100 (percent)
  y: string|number
): Promise<object>

tap(devices: string, x: string|number, y: string|number): Promise<object>
  // press → 50ms delay → release

inputText(devices: string, text: string): Promise<object>
writeClipBoard(devices: string, text: string): Promise<object>

// Navigation
pushEvent(devices: string, type: "0"|"1"|"2"): Promise<object>
  // 0=back, 1=home, 2=recents
goHome(devices: string): Promise<object>
goBack(devices: string): Promise<object>
recentApps(devices: string): Promise<object>
swipeUp(devices: string): Promise<object>
swipeDown(devices: string): Promise<object>

// App management
startApk(devices: string, packageName: string): Promise<object>
stopApk(devices: string, packageName: string): Promise<object>
installApk(devices: string, filePath: string): Promise<object>
uninstallApk(devices: string, packageName: string): Promise<object>
apkList(devices: string): Promise<object>

// Device info
imeList(devices: string): Promise<object>
screen(devices: string, savePath?: string): Promise<object>
updateDevices(devices: string, data: object): Promise<object>
```

**Events emitted:**

| Event | Payload | When |
|---|---|---|
| `"connected"` | _(none)_ | WebSocket `open` fires |
| `"disconnected"` | _(none)_ | WebSocket `close` fires (only if was previously connected) |
| `"extended-disconnect"` | `{ duration: number }` | Reconnect after >2 minutes offline |
| `"error"` | `Error` | WebSocket `error` fires |
| `"response"` | `object` | Every parsed inbound message |

**Usage in `agent.js`:**

```js
xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);
xiaowei.on("disconnected", handler);
xiaowei.on("error", handler);
// waitForXiaowei() calls xiaowei.connect() then listens for "connected"
```

---

### `SupabaseSync`

**File:** `agent/core/supabase-sync.js`

```js
/**
 * @constructor
 * @param {string} supabaseUrl
 * @param {string} supabaseAnonKey
 * @param {string|undefined} supabaseServiceRoleKey
 *   When provided, all queries use the service-role client (bypasses RLS).
 *   Falls back to anon client when omitted.
 */
new SupabaseSync(supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey)
```

**Dependencies:** `@supabase/supabase-js`, `fs`, `path`

**Instance properties (public):**

| Property | Type | Description |
|---|---|---|
| `supabase` | `SupabaseClient` | Active client (service-role preferred) |
| `supabaseAdmin` | `SupabaseClient\|null` | Service-role client; `null` if key not provided |
| `pcId` | `string\|null` | UUID set by `getPcId()` |

**Public methods:**

```js
// Connection
verifyConnection(): Promise<boolean>     // Throws on failure

// PC registration
getPcId(pcNumber: string): Promise<string>
  // pcNumber format: "PC00"–"PC99"
  // Sets this.pcId; upserts row in pcs table
updatePcStatus(
  pcId: string,
  status: "online"|"offline"|"error"
): Promise<void>

// Device sync
upsertDevice(
  serial: string,
  pcId: string,
  status: string,
  model: string|null,
  battery: number|null
): Promise<void>

batchUpsertDevices(
  devices: Array<{
    serial: string,
    status?: string,                // default "online"
    model?: string,
    battery?: number,
    ipIntranet?: string,
    task_status?: string,
    current_assignment_id?: string,
    current_video_title?: string,
    watch_progress?: number,
    consecutive_errors?: number,
    daily_watch_count?: number,
    daily_watch_seconds?: number
  }>,
  pcId: string
): Promise<boolean>                      // true on success

syncDeviceTaskStates(
  states: Array<{
    serial: string,
    status?: string,
    assignmentId?: string|null,
    videoTitle?: string|null,
    watchProgress?: number,
    errorCount?: number,
    dailyWatchCount?: number,
    dailyWatchSeconds?: number
  }>
): Promise<void>

markOfflineDevices(pcId: string, activeSerials: string[]): Promise<void>

// Task management
getPendingTasks(pcId: string): Promise<Array<object>>
  // Returns tasks assigned to pcId OR unassigned (pc_id=null, auto-claimed)
updateTaskStatus(
  taskId: string,
  status: "pending"|"running"|"completed"|"failed",
  result: object|null,
  error: string|null
): Promise<void>
incrementRetryCount(taskId: string): Promise<void>

// Counts / diagnostics
getTaskCounts(pcId: string): Promise<{
  running: number, pending: number,
  completed_today: number, failed_today: number
}>
getProxyCounts(pcId: string): Promise<{
  total: number, valid: number, invalid: number, unassigned: number
}>
getDeviceCounts(pcId: string): Promise<{
  total: number, online: number, busy: number, error: number, offline: number
}>

// Logging (buffered — 50-entry batches, 3s flush interval, 500-entry hard cap)
insertExecutionLog(
  executionId: string,
  deviceId: string|null,
  action: string,
  data: object|null,
  details: object|null,
  statusLabel: "success"|"error"|"warning"|"info",
  message: string
): { ok: true, logId: null }             // returns synchronously; flush is async

getLogStats(): { inserted: number, failed: number, buffered: number }

flushAndClose(): Promise<void>           // drain buffer; call on shutdown

// Realtime subscriptions
subscribeToBroadcast(
  pcId: string,
  callback: (task: object) => void,
  timeoutMs?: number = 10000
): Promise<{ status: "SUBSCRIBED"|"CHANNEL_ERROR"|"TIMED_OUT"|"TIMEOUT", channel: object }>

subscribeToTasks(
  pcId: string,
  callback: (task: object) => void,
  timeoutMs?: number = 10000
): Promise<{ status: string, channel: object }>

subscribeToTaskLogs(
  taskId: string,
  callback: (logEntry: object) => void
): object                                // returns Supabase channel

unsubscribeFromTaskLogs(taskId: string): Promise<void>

unsubscribe(): Promise<void>             // removes all channels; calls flushAndClose()

getSubscriptionStatus(): {
  broadcast: string|null,
  pgChanges: string|null,
  broadcastReceived: number,
  pgChangesReceived: number,
  lastVia: "broadcast"|"pg_changes"|"poll"|null
}
```

**Events emitted:** None.

---

### `DashboardBroadcaster`

**File:** `agent/core/dashboard-broadcaster.js`

```js
/**
 * @constructor
 * @param {SupabaseClient} supabase - Active Supabase client (supabaseSync.supabase)
 * @param {string} pcId            - Worker PC UUID (supabaseSync.pcId)
 */
new DashboardBroadcaster(supabase, pcId)
```

**Public methods:**

```js
init(): Promise<void>
  // Subscribes to "room:dashboard" and "room:system" broadcast channels.
  // Must be called before any publish method.

publishDashboardSnapshot(snapshot: object): Promise<void>
  // Sends event type "dashboard_snapshot" on "room:dashboard".

publishSystemEvent(
  eventType: string,   // e.g. "device_offline", "device_recovered"
  message: string,
  details?: object     // default {}
): Promise<void>
  // Payload: { type: "event", event_type, message, details, timestamp: ISO string }

detectAndPublishChanges(
  currentDevices: Array<{ serial: string, status: string }>
): Promise<{ offline: string[], recovered: string[] }>
  // Diffs against internal previousDeviceStates Map.
  // Publishes at most one "device_offline" and one "device_recovered" system event per call.

cleanup(): Promise<void>
  // Removes both broadcast channels. Call on shutdown.
```

**Events emitted:** None. Publishes to Supabase Realtime channels consumed by the Next.js frontend.

---

## device/

All modules live in `agent/device/`. Re-exported from `agent/device/index.js`.

---

### `DeviceOrchestrator`

**File:** `device/device-orchestrator.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient}   xiaowei
 * @param {SupabaseClient}  supabase      - Direct (not SupabaseSync)
 * @param {TaskExecutor}    taskExecutor  - Called for job assignments via runAssignment()
 * @param {{ pcId: string, maxConcurrent?: number }} config  - maxConcurrent default 10
 */
new DeviceOrchestrator(xiaowei, supabase, taskExecutor, config)
```

**Internal device state:**

```js
/** @typedef {object} DeviceState
 * @property {'idle'|'free_watch'|'searching'|'watching'|'completing'|'error'|'quarantined'} status
 * @property {string|null} assignmentId
 * @property {string|null} videoTitle
 * @property {number|null} startedAt       // Date.now() timestamp
 * @property {number}      watchProgress   // 0–100
 * @property {number}      errorCount
 * @property {number}      dailyWatchCount
 * @property {number}      dailyWatchSeconds
 * @property {string|null} lastTaskAt      // ISO string
 */
```

**Constants:** `ORCHESTRATE_INTERVAL_MS = 3000`, `WATCH_TIMEOUT_MS = 30 * 60 * 1000`, `SAME_JOB_MAX_DEVICES = 5`

**Public methods:**

```js
start(): void                            // Starts 3-second poll loop
stop(): void                             // Clears poll interval

getStatus(): {
  pcId: string,
  maxConcurrent: number,
  runningCount: number,
  deviceStates: Record<string, {
    status: string, assignmentId: string|null, videoTitle: string|null,
    watchProgress: number, errorCount: number,
    dailyWatchCount: number, dailyWatchSeconds: number
  }>
}

getDeviceStatesForSync(): Record<string, {
  task_status: string,
  current_assignment_id: string|null,
  current_video_title: string|null,
  watch_progress: number,
  consecutive_errors: number,
  daily_watch_count: number,
  daily_watch_seconds: number
}>
```

**Supabase RPC called:** `claim_next_assignment(p_pc_id: string, p_device_serial: string)` → `{ id, job_id, video_title, device_serial, ... } | null`

**Events emitted:** None.

---

### `DeviceWatchdog`

**File:** `device/device-watchdog.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient}             xiaowei
 * @param {SupabaseSync}              supabaseSync
 * @param {object}                    config
 * @param {DashboardBroadcaster|null} broadcaster
 */
new DeviceWatchdog(xiaowei, supabaseSync, config, broadcaster)
```

**Key thresholds (instance properties, overridable):**

| Property | Default | Meaning |
|---|---|---|
| `CHECK_INTERVAL_MS` | `60000` | Poll period |
| `RECOVERY_MAX_ATTEMPTS` | `3` | Max reconnect tries before marking dead |
| `MASS_DROPOUT_THRESHOLD` | `0.20` | Fraction of online devices triggering mass-dropout logic |
| `MASS_DROPOUT_PAUSE_MS` | `120000` | Dispatch pause after mass dropout |
| `ERROR_COUNT_TRIGGER` | `3` | Consecutive error cycles before recovery attempt |

**Public methods:**

```js
start(): void                     // Starts 60-second unref'd interval
stop(): void                      // Clears interval and pause timeout
get isDispatchPaused(): boolean   // True during 2-minute post-mass-dropout window
```

**Supabase Broadcast published** (channel `room:system`, event `event`):

```js
{
  type: 'device_dead' | 'mass_dropout',
  data: { serial?: string, reason?: string, offlineCount?: number, totalCount?: number },
  timestamp: string  // ISO
}
```

---

### `AdbReconnectManager`

**File:** `device/adb-reconnect.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient}             xiaowei
 * @param {SupabaseSync}              supabaseSync
 * @param {DashboardBroadcaster|null} broadcaster
 * @param {object}                    config
 */
new AdbReconnectManager(xiaowei, supabaseSync, broadcaster, config)
```

**Key properties (overridable):**

| Property | Default |
|---|---|
| `reconnectInterval` | `60000` ms |
| `batchSize` | `10` |
| `maxRetries` | `2` |
| `deadThreshold` | `10` consecutive failures |

**Public methods:**

```js
start(): void
stop(): void
updateRegisteredDevices(devices: Array<{serial: string}>): void  // called each heartbeat
reconnectCycle(): Promise<void>                                   // overlap-guarded
reconnectDevice(serial: string): Promise<{serial, status, isDead?}|null>
applyStatusChanges(changes: Array<{serial, status}>): Promise<void>
getHealthyDevices(): string[]
resetDevice(serial: string): boolean
getFailureStats(): Array<{serial, failures, lastDisconnect, isDead}>
parseDeviceList(response: object): Array<{serial: string}>
```

**Broadcaster events** (via `publishSystemEvent`):

| Event type | Payload |
|---|---|
| `adb_reconnect_success` | `{ serials: string[], count: number }` |
| `adb_reconnect_failed` | `{ serials: string[], count: number }` |
| `adb_device_dead` | `{ serials: string[], count: number }` |

---

### `devicePresets`

**File:** `device/device-presets.js`

Module exports plain async functions (no class).

```js
/**
 * @param {XiaoweiClient} xiaowei
 * @param {string} serial
 * @returns {Promise<ScanResult>}
 */
scan(xiaowei, serial)

/** @typedef {object} ScanResult
 * @property {string}   serial
 * @property {string}   model
 * @property {string}   android_version
 * @property {string}   sdk_version
 * @property {boolean}  auto_rotate
 * @property {number}   brightness
 * @property {number}   battery_level
 * @property {boolean}  battery_charging
 * @property {string}   youtube_version
 * @property {boolean}  adb_keyboard_installed
 * @property {string|null} http_proxy
 * @property {string[]} issues           // flags: e.g. 'auto_rotate_on', 'volume_not_zero'
 * @property {object}   raw              // raw adbShell results keyed by check name
 */

optimize(
  xiaowei: XiaoweiClient,
  serial: string,
  options?: { setAdbKeyboard?: boolean }  // default true
): Promise<{ serial: string, log: Array<{desc, status, error?}>, ok: number, errors: number }>

ytTest(
  xiaowei: XiaoweiClient,
  serial: string
): Promise<{ serial: string, pass: boolean, steps: Array<{name, ok, detail}>, errors: string[] }>

warmup(
  xiaowei: XiaoweiClient,
  serial: string,
  options?: { durationSec?: number }     // default rand 120–300 s
): Promise<{ serial: string, videosWatched: number, totalSec: number, errors: string[] }>

installApks(
  xiaowei: XiaoweiClient,
  serial: string,
  options?: { xwKeyboardPath?: string, assistantPath?: string, hidmanagerPath?: string }
): Promise<{ serial: string, results: Array<{name, status, error?}> }>

init(
  xiaowei: XiaoweiClient,
  serial: string,
  supabase: SupabaseClient|null,
  pcId: string|null
): Promise<{ serial, status: 'online'|'error', scan: ScanResult, install: object, optimize: object, ytTest: object }>

// Utility — normalizes adbShell response to string
extractValue(res: object|null, serial: string): string
```

---

### `startHeartbeat`

**File:** `device/heartbeat.js`

```js
/**
 * @param {XiaoweiClient}                        xiaowei
 * @param {SupabaseSync}                         supabaseSync
 * @param {object}                               config       - .heartbeatInterval (ms, default 30000)
 * @param {TaskExecutor|null}                    taskExecutor
 * @param {DashboardBroadcaster|null}            broadcaster
 * @param {AdbReconnectManager|null}             reconnectManager
 * @param {(() => DeviceOrchestrator|null)|null} getDeviceOrchestrator  - getter (lazy — orchestrator may not exist yet)
 * @returns {NodeJS.Timeout}  - clearInterval() this on shutdown
 */
function startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager, getDeviceOrchestrator)
```

**What each beat does (in order):**

1. `xiaowei.list()` → `parseDeviceList()` — collect live device serials
2. `supabaseSync.updatePcStatus(pcId, 'online')`
3. `supabaseSync.batchUpsertDevices(devices, pcId)`
4. `orchestrator.getDeviceStatesForSync()` → `supabaseSync.syncDeviceTaskStates(states)`
5. `reconnectManager.updateRegisteredDevices(devices)`
6. `supabaseSync.markOfflineDevices(pcId, activeSerials)`
7. `broadcaster.detectAndPublishChanges(devices)` + `broadcaster.publishDashboardSnapshot({...})`

**Also exported:**

```js
/**
 * Normalizes Xiaowei list() response into a device array.
 * Handles array, {data:[]}, {devices:[]}, {list:[]}, and serial-keyed object shapes.
 * @param {object} response
 * @returns {Array<{ serial: string, model: string, status: 'online', battery: number|null, ipIntranet: string|null }>}
 */
function parseDeviceList(response)
```

---

## task/

All modules live in `agent/task/`. Exported via `agent/task/index.js`.

---

### `TaskExecutor`

**File:** `task/task-executor.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient} xiaowei
 * @param {SupabaseSync}  supabaseSync
 * @param {object}        config
 */
new TaskExecutor(xiaowei, supabaseSync, config)
```

**Public properties:**

| Property | Type | Description |
|---|---|---|
| `maxConcurrent` | `number` | default 20; updated by `config-updated` event |
| `maxRetryCount` | `number` | Set externally |
| `stats` | `{ total: number, succeeded: number, failed: number }` | Execution counters |

**Public methods:**

```js
/**
 * Entry point. No-ops if task already running or maxConcurrent reached.
 * @param {object} task - Supabase tasks row ({ id, task_name|task_type|type, payload, ... })
 */
async execute(task): Promise<void>

/**
 * Run a single job_assignment row (called by DeviceOrchestrator).
 * @param {object} assignment - { id, job_id, device_id, device_serial, ... }
 */
async runAssignment(assignment): Promise<void>

/** @param {number} [intervalMs=15000] */
startJobAssignmentPolling(intervalMs?: number): void
stopJobAssignmentPolling(): void
```

**Task types using `job_assignments`:** `watch_video`, `view_farm`, `subscribe`, `like`, `comment`, `custom`, `action`, `script`, `run_script`, `actionCreate`

**Events emitted:** None. All outcomes written to Supabase.

---

### `TaskStateMachine`

**File:** `task/task-state-machine.js`

```js
/**
 * @constructor
 * @param {{ maxRetries?: number, retryDelayMs?: number, taskId?: string }} [opts]
 *   maxRetries    default 3
 *   retryDelayMs  default 5000
 */
new TaskStateMachine(opts?)
```

**State machine:**

```
IDLE → QUEUED → RUNNING → COMPLETED → IDLE
                        ↘ FAILED → RETRY_PENDING → RUNNING   (retryCount ≤ maxRetries)
                                 ↘ DEAD_LETTER               (retryCount > maxRetries)
```

**Valid transitions (`TaskStateMachine.TRANSITIONS`):**

| From | Allowed next |
|---|---|
| `IDLE` | `QUEUED` |
| `QUEUED` | `RUNNING`, `FAILED` |
| `RUNNING` | `COMPLETED`, `FAILED` |
| `COMPLETED` | `IDLE` |
| `FAILED` | `RETRY_PENDING`, `DEAD_LETTER`, `IDLE` |
| `RETRY_PENDING` | `RUNNING`, `DEAD_LETTER` |
| `DEAD_LETTER` | _(terminal — no transitions)_ |

**Public methods:**

```js
get current(): string                    // Current state

transition(next: string, reason?: string): this   // Throws on invalid transition
enqueue(reason?: string): this           // IDLE → QUEUED
start(reason?: string): this            // QUEUED → RUNNING
complete(reason?: string): this         // RUNNING → COMPLETED
fail(reason?: string): this             // → FAILED → RETRY_PENDING or DEAD_LETTER
scheduleRetry(cb: () => Promise<void>): this  // RETRY_PENDING → RUNNING after retryDelayMs
reset(reason?: string): this            // Force IDLE from any state; cancels retry timer
getHistory(): Array<{ state: string, reason: string, ts: number }>
```

**Events emitted:**

| Event | Payload |
|---|---|
| `transition` | `{ prev, next, reason, taskId }` |
| `retry_pending` | `{ retryCount, maxRetries, taskId }` |
| `dead_letter` | `{ retryCount, taskId }` |
| `retry_error` | `{ err, taskId }` |
| `reset` | `{ prev, reason, taskId }` |

---

### `CommandExecutor`

**File:** `task/command-executor.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient} xiaowei
 * @param {SupabaseSync}  supabaseSync
 * @param {object}        config
 */
new CommandExecutor(xiaowei, supabaseSync, config)
```

**Public methods:**

```js
async subscribe(): Promise<void>     // Subscribe to command_logs INSERT events
async unsubscribe(): Promise<void>   // Release the Realtime channel
```

**Execution flow:** mark `running` → resolve serials → execute in batches of 10 with 1 s gap and 30 s per-device timeout → broadcast progress → mark `completed`/`failed`.

**Broadcast payload** (channel `room:command:<commandId>`, event `progress`/`complete`):

```js
{
  command_id: string,
  completed: number,
  total: number,
  failed: number,
  is_final: boolean,
  latest_results: Array<{ device_serial: string, success: boolean, output_preview: string }>
}
```

**Blocked commands:** `rm -rf`, `format`, `factory_reset`, `wipe`, `flash`, `dd if=`

---

### `CommandPoller`

**File:** `task/command-poller.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient}  xiaowei
 * @param {SupabaseClient} supabase          - Raw Supabase client (not SupabaseSync)
 * @param {{ pcId?: string, commandPollIntervalSec?: number }} [config]
 */
new CommandPoller(xiaowei, supabase, config?)
```

**Public methods:**

```js
start(): void    // Starts polling interval + immediate poll
stop(): void     // Clears interval
```

**Poll batch:** up to 5 `preset_commands` rows per cycle, `status = 'pending'`, ordered by `created_at ASC`.

**Supported presets:** `scan`, `optimize`, `yttest`, `warmup`, `init`, `install_apks`

---

### `StaleTaskCleaner`

**File:** `task/stale-task-cleaner.js`

```js
/**
 * @constructor
 * @param {SupabaseSync} supabaseSync
 * @param {object}       config
 */
new StaleTaskCleaner(supabaseSync, config)
```

**Constants:** `STALE_THRESHOLD_MS = 30 min`, `CHECK_INTERVAL_MS = 5 min`, timeout threshold `= 60 min`

**Public methods:**

```js
async recoverStaleTasks(): Promise<number>  // Cold-start; mark old running→failed; returns count
startPeriodicCheck(): void                  // unref'd interval every 5 min
stop(): void
```

**Supabase Broadcast events** (channel `room:system`):

| `type` | Payload |
|---|---|
| `stale_task_recovered` | `{ count, taskIds, pcId }` |
| `task_timeout` | `{ count, taskIds, pcId }` |

---

## scheduling/

All modules live in `agent/scheduling/`. Exported via `agent/scheduling/index.js`.

---

### `QueueDispatcher`

**File:** `scheduling/queue-dispatcher.js`

```js
/**
 * @constructor
 * @param {SupabaseSync}              supabaseSync
 * @param {object}                    config       - reads config.maxConcurrentTasks
 * @param {DashboardBroadcaster|null} broadcaster
 */
new QueueDispatcher(supabaseSync, config, broadcaster)
```

**Public methods:** `start(): void`, `stop(): void` — 10-second interval.

**Flow:** count `running` tasks → compute available slots → claim up to `available` rows from `task_queue` (ordered by `priority DESC, created_at ASC`) → insert `tasks` rows → update `task_queue` to `dispatched`.

**Key data shapes:**

```js
// task_queue row (consumed)
{
  id: string,
  status: 'queued' | 'dispatched',
  priority: number,
  task_config: {
    videoId?: string, channelId?: string,
    type?: string,          // default: 'youtube'
    taskType?: string,      // default: 'view_farm'
    deviceCount?: number,   // default: 20
    variables?: object,
    pcId?: string,
  }
}

// tasks row (produced)
{
  video_id: string|null, channel_id: string|null,
  type: string, task_type: string, device_count: number,
  payload: object, status: 'pending', pc_id?: string
}
```

---

### `ScheduleEvaluator`

**File:** `scheduling/schedule-evaluator.js`

```js
/**
 * @constructor
 * @param {SupabaseSync}              supabaseSync
 * @param {DashboardBroadcaster|null} broadcaster
 */
new ScheduleEvaluator(supabaseSync, broadcaster)
```

**Public methods:** `start(): void`, `stop(): void` — 30-second interval.

**Static utilities:**

```js
static computeNextRun(cronExpr: string): string    // → ISO timestamp; falls back to +1h on error
static validateCron(cronExpr: string): { valid: boolean, error?: string }
```

**Flow:** query `task_schedules WHERE is_active AND next_run_at <= now()` → check overlap (existing `task_queue` or `tasks` still running) → insert `task_queue` row → advance `next_run_at`, `last_run_at`, `run_count`.

---

### VideoDispatcher (removed)

VideoDispatcher (jobs + job_assignments) has been removed. Task execution uses **task_devices** only. Create tasks + task_devices via web dashboard or QueueDispatcher / ScheduleEvaluator.

---

## setup/

All modules live in `agent/setup/`. Exported via `agent/setup/index.js`.

---

### `ProxyManager`

**File:** `setup/proxy-manager.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient}             xiaowei
 * @param {SupabaseSync}              supabaseSync
 * @param {object}                    config       - reads proxyCheckInterval, proxyPolicy
 * @param {DashboardBroadcaster|null} broadcaster
 */
new ProxyManager(xiaowei, supabaseSync, config, broadcaster)
```

**Public property:** `assignments: Map<string, ProxyAssignment>` — keyed by device serial.

```js
/** @typedef {object} ProxyAssignment
 * @property {string}      proxyId
 * @property {string}      address    // 'host:port'
 * @property {string|null} username
 * @property {string|null} password
 * @property {string}      type       // default: 'socks5'
 * @property {string}      deviceId
 * @property {number}      failCount
 */
```

**Public methods:**

```js
loadAssignments(workerId: string): Promise<number>
applyProxy(serial: string, proxy: ProxyAssignment): Promise<boolean>
applyAll(): Promise<{ applied: number, failed: number, total: number }>
clearProxy(serial: string): Promise<boolean>
clearAll(): Promise<number>
verifyProxy(serial: string): Promise<{ ok: boolean, currentProxy: string|null, externalIp: string|null }>
verifyAll(): Promise<{ verified: number, failed: number, results: Map<string, object> }>
startCheckLoop(workerId: string): void
stopCheckLoop(): void
applyConfigChange(key: 'proxy_check_interval'|'proxy_policy', newValue: any): void
```

**Policies:** `sticky` (keep assigned proxy), `rotate_on_failure` (auto-rotate at `fail_count >= 3`), `rotate_daily`.

---

### `AccountManager`

**File:** `setup/account-manager.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient} xiaowei
 * @param {SupabaseSync}  supabaseSync
 */
new AccountManager(xiaowei, supabaseSync)
```

**Public property:** `assignments: Map<string, AccountAssignment>` — keyed by device serial.

```js
/** @typedef {object} AccountAssignment
 * @property {string} accountId
 * @property {string} email
 * @property {string} status   // 'available'|'in_use'|'cooldown'|'banned'|'retired'
 * @property {string} deviceId
 */
```

**Public methods:**

```js
loadAssignments(workerId: string): Promise<number>
verifyLogin(serial: string): Promise<{ loggedIn: boolean, googleEmail: string|null }>
verifyAll(): Promise<{ verified: number, failed: number, total: number }>
```

---

### `ScriptVerifier`

**File:** `setup/script-verifier.js`

```js
/**
 * @constructor
 * @param {XiaoweiClient} xiaowei
 * @param {{ scriptsDir: string }} config
 */
new ScriptVerifier(xiaowei, config)
```

**Public property:** `availableScripts: string[]` — `.js` filenames in `scriptsDir`.

**Public methods:**

```js
checkScriptsDir(): { ok: boolean, path: string, files: string[] }   // synchronous
checkRequired(): { ok: boolean, found: string[], missing: string[] } // synchronous
ensureTestScript(): string                                            // → absolute path to test_ping.js
runTestScript(serial: string): Promise<{ ok: boolean, response: object|null }>
verifyAll(testSerial: string|null): Promise<{ dirOk: boolean, requiredOk: boolean, testOk: boolean }>
```

**Required scripts:** `youtube_watch.js` (core watch-farming AutoJS script)

---

### `CommentGenerator`

**File:** `setup/comment-generator.js`

```js
/**
 * @constructor
 * @param {string} apiKey  - OpenAI API key
 * @param {string} [model] - default: 'gpt-4o-mini'
 */
new CommentGenerator(apiKey, model)
```

**Public methods:**

```js
generate(videoTitle: string, channelName: string, videoId: string): Promise<string|null>
  // Retries up to 3 times. Returns null on all failures.
```

**Validation rules:** length 5–100 chars; rejects spam keywords (`구독`, `좋아요`, `광고`, `http`, etc.) and AI self-identification phrases.

> **Note:** `CommentGenerator` is exported from `setup/index.js` but is not instantiated in `agent.js`. Used internally by `TaskExecutor` for `comment` task type via `require("../setup/comment-generator")`.
