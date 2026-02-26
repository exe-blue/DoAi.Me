/**
 * STEP 9 — AgentConfig Unit Tests
 *
 * Success Criteria Coverage:
 *   S-10: Agent startup loads all config from DB
 *   S-4:  Agent detects config change within 5s (event emitted)
 *   S-5:  Agent applies new interval (config property updated)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Helpers: mock Supabase client ────────────────────────────────

function createMockSupabase(
  settingsRows: Array<{ key: string; value: string; description: string; updated_at: string }>
) {
  const channels = new Map<string, any>();

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        data: settingsRows,
        error: null,
      }),
    }),
    channel: vi.fn().mockImplementation((name: string) => {
      const ch: any = {
        callbacks: new Map<string, Function>(),
        on: vi.fn().mockImplementation((_type: string, _filter: any, cb: Function) => {
          ch.callbacks.set("update", cb);
          return ch;
        }),
        subscribe: vi.fn().mockImplementation((cb?: Function) => {
          if (cb) cb("SUBSCRIBED");
          return ch;
        }),
      };
      channels.set(name, ch);
      return ch;
    }),
    removeChannel: vi.fn().mockResolvedValue(undefined),
    _channels: channels,
  };
}

// ── Get a fresh AgentConfig instance per test ────────────────────

function createFreshConfig() {
  // Access the class via the exposed .AgentConfig property
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../agent/config");
  const AgentConfig = mod.AgentConfig;
  return new AgentConfig();
}

// ── S-10: Agent startup loads all config ─────────────────────────

describe("S-10: AgentConfig.loadFromDB", () => {
  let config: any;

  beforeEach(() => {
    config = createFreshConfig();
  });

  it("should load all settings from DB and map to config properties", async () => {
    const rows = [
      { key: "heartbeat_interval", value: "15000", description: "", updated_at: "" },
      { key: "adb_reconnect_interval", value: "30000", description: "", updated_at: "" },
      { key: "proxy_check_interval", value: "120000", description: "", updated_at: "" },
      { key: "proxy_policy", value: '"rotate_on_failure"', description: "", updated_at: "" },
      { key: "max_concurrent_tasks", value: "10", description: "", updated_at: "" },
      { key: "device_interval", value: "200", description: "", updated_at: "" },
      { key: "watch_duration", value: "[60, 300]", description: "", updated_at: "" },
      { key: "task_interval", value: "[2000, 5000]", description: "", updated_at: "" },
      { key: "max_retry_count", value: "5", description: "", updated_at: "" },
      { key: "log_retention_days", value: "14", description: "", updated_at: "" },
      { key: "command_log_retention_days", value: "60", description: "", updated_at: "" },
    ];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);

    expect(config.heartbeatInterval).toBe(15000);
    expect(config.adbReconnectInterval).toBe(30000);
    expect(config.proxyCheckInterval).toBe(120000);
    expect(config.proxyPolicy).toBe("rotate_on_failure");
    expect(config.maxConcurrentTasks).toBe(10);
    expect(config.deviceInterval).toBe(200);
    expect(config.watchDuration).toEqual([60, 300]);
    expect(config.taskInterval).toEqual([2000, 5000]);
    expect(config.maxRetryCount).toBe(5);
    expect(config.logRetentionDays).toBe(14);
    expect(config.commandLogRetentionDays).toBe(60);
  });

  it("should keep env defaults when DB returns no rows", async () => {
    const supabase = createMockSupabase([]);
    const defaultHeartbeat = config.heartbeatInterval;
    await config.loadFromDB(supabase);

    expect(config.heartbeatInterval).toBe(defaultHeartbeat);
    expect(config.proxyPolicy).toBe("sticky");
  });

  it("should handle DB error gracefully without crashing", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          data: null,
          error: { message: "connection refused" },
        }),
      }),
    };
    // Should not throw
    await config.loadFromDB(supabase);
    // Defaults remain
    expect(config.proxyPolicy).toBe("sticky");
  });

  it("should expose raw values via get() method", async () => {
    const rows = [
      { key: "proxy_policy", value: '"sticky"', description: "", updated_at: "" },
      { key: "heartbeat_interval", value: "30000", description: "", updated_at: "" },
    ];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);

    expect(config.get("proxy_policy")).toBe("sticky");
    expect(config.get("heartbeat_interval")).toBe(30000);
    expect(config.get("nonexistent")).toBeUndefined();
  });
});

// ── S-4: Agent detects change (config-updated event) ─────────────

describe("S-4: AgentConfig config-updated event", () => {
  let config: any;

  beforeEach(() => {
    config = createFreshConfig();
  });

  it("should emit config-updated with key, oldValue, newValue when a setting changes", async () => {
    const rows = [{ key: "heartbeat_interval", value: "30000", description: "", updated_at: "" }];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);
    expect(config.heartbeatInterval).toBe(30000);

    config.subscribeToChanges(supabase);

    const events: Array<{ key: string; oldValue: any; newValue: any }> = [];
    config.on("config-updated", (e: any) => events.push(e));

    const channel = supabase._channels.get("settings-realtime");
    expect(channel).toBeDefined();

    const updateCallback = channel!.callbacks.get("update");
    expect(updateCallback).toBeDefined();

    // Simulate: heartbeat_interval changed from 30000 to 15000
    updateCallback!({ new: { key: "heartbeat_interval", value: "15000" } });

    expect(events).toHaveLength(1);
    expect(events[0].key).toBe("heartbeat_interval");
    expect(events[0].oldValue).toBe(30000);
    expect(events[0].newValue).toBe(15000);
    expect(config.heartbeatInterval).toBe(15000);
  });

  it("should emit for proxy_policy change with string values", async () => {
    const rows = [{ key: "proxy_policy", value: '"sticky"', description: "", updated_at: "" }];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);
    config.subscribeToChanges(supabase);

    const events: any[] = [];
    config.on("config-updated", (e: any) => events.push(e));

    const channel = supabase._channels.get("settings-realtime");
    channel!.callbacks.get("update")!({ new: { key: "proxy_policy", value: '"rotate_on_failure"' } });

    expect(events[0].key).toBe("proxy_policy");
    expect(events[0].oldValue).toBe("sticky");
    expect(events[0].newValue).toBe("rotate_on_failure");
    expect(config.proxyPolicy).toBe("rotate_on_failure");
  });
});

// ── S-5: Config property updated correctly ───────────────────────

describe("S-5: Config applies new values to properties", () => {
  let config: any;

  beforeEach(() => {
    config = createFreshConfig();
  });

  it("should update maxConcurrentTasks when setting changes", async () => {
    const rows = [{ key: "max_concurrent_tasks", value: "20", description: "", updated_at: "" }];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);
    expect(config.maxConcurrentTasks).toBe(20);

    config.subscribeToChanges(supabase);
    const channel = supabase._channels.get("settings-realtime");
    channel!.callbacks.get("update")!({ new: { key: "max_concurrent_tasks", value: "5" } });

    expect(config.maxConcurrentTasks).toBe(5);
  });

  it("should update array values (watch_duration, task_interval)", async () => {
    const rows = [
      { key: "watch_duration", value: "[30, 120]", description: "", updated_at: "" },
      { key: "task_interval", value: "[1000, 3000]", description: "", updated_at: "" },
    ];
    const supabase = createMockSupabase(rows);
    await config.loadFromDB(supabase);

    config.subscribeToChanges(supabase);
    const channel = supabase._channels.get("settings-realtime");

    channel!.callbacks.get("update")!({ new: { key: "watch_duration", value: "[60, 600]" } });
    expect(config.watchDuration).toEqual([60, 600]);

    channel!.callbacks.get("update")!({ new: { key: "task_interval", value: "[500, 2000]" } });
    expect(config.taskInterval).toEqual([500, 2000]);
  });

  it("should unsubscribe cleanly", async () => {
    const supabase = createMockSupabase([]);
    config.subscribeToChanges(supabase);

    await config.unsubscribe(supabase);
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });
});
