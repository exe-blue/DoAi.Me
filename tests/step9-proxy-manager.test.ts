/**
 * STEP 9 — ProxyManager Unit Tests
 *
 * Success Criteria Coverage:
 *   S-9:  rotate_on_failure: fail_count increment → invalid at threshold → auto-assigns new proxy
 *   S-7:  (structure) failure tracking and DB updates
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock factories ───────────────────────────────────────────────

function createMockXiaowei(connected = true) {
  return {
    connected,
    adbShell: vi.fn().mockResolvedValue({ output: "ok" }),
  };
}

function createMockSupabaseSync() {
  const updateResults: Array<{ table: string; data: any; filter: any }> = [];

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockImplementation((data: any) => {
          const chain = {
            eq: vi.fn().mockImplementation((_col: string, _val: any) => {
              updateResults.push({ table, data, filter: { [_col]: _val } });
              return { data: null, error: null };
            }),
            in: vi.fn().mockImplementation((_col: string, _vals: any[]) => {
              updateResults.push({ table, data, filter: { [_col]: _vals } });
              return { data: null, error: null };
            }),
          };
          return chain;
        }),
        insert: vi.fn().mockReturnValue({ data: null, error: null }),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          // Return empty candidates by default
          return { data: [], error: null };
        }),
        data: [],
        error: null,
      };
    }),
    _updateResults: updateResults,
  };

  return {
    supabase,
    workerId: "test-worker-id",
  };
}

function createMockConfig(policy = "sticky") {
  return {
    proxyPolicy: policy,
    proxyCheckInterval: 300000,
  };
}

function createMockBroadcaster() {
  return {
    publishSystemEvent: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Load ProxyManager ────────────────────────────────────────────

function loadProxyManager() {
  const modPath = require.resolve("../agent/proxy-manager");
  delete require.cache[modPath];
  return require("../agent/proxy-manager");
}

// ── S-9: Failure Detection ───────────────────────────────────────

describe("S-9: ProxyManager failure detection", () => {
  let ProxyManager: any;
  let manager: any;
  let mockXiaowei: any;
  let mockSync: any;
  let mockConfig: any;
  let mockBroadcaster: any;

  beforeEach(() => {
    ProxyManager = loadProxyManager();
    mockXiaowei = createMockXiaowei();
    mockSync = createMockSupabaseSync();
    mockConfig = createMockConfig("rotate_on_failure");
    mockBroadcaster = createMockBroadcaster();
    manager = new ProxyManager(mockXiaowei, mockSync, mockConfig, mockBroadcaster);
  });

  it("should increment fail_count in DB when proxy verification fails", async () => {
    const proxy = {
      proxyId: "proxy-001",
      address: "1.2.3.4:1080",
      username: null,
      password: null,
      type: "socks5",
      deviceId: "device-001",
      failCount: 0,
    };

    await manager._handleProxyFailure("serial-001", proxy, "worker-001");

    // fail_count should be updated in DB
    const updates = mockSync.supabase._updateResults;
    const failCountUpdate = updates.find(
      (u: any) => u.table === "proxies" && u.data.fail_count === 1
    );
    expect(failCountUpdate).toBeDefined();
    expect(proxy.failCount).toBe(1);
  });

  it("should NOT mark proxy invalid when fail_count < 3", async () => {
    const proxy = {
      proxyId: "proxy-001",
      address: "1.2.3.4:1080",
      username: null,
      password: null,
      type: "socks5",
      deviceId: "device-001",
      failCount: 1, // Will become 2, still below threshold
    };

    await manager._handleProxyFailure("serial-001", proxy, "worker-001");

    expect(proxy.failCount).toBe(2);
    // Should only have fail_count update, not status update
    const updates = mockSync.supabase._updateResults;
    const statusUpdate = updates.find(
      (u: any) => u.table === "proxies" && u.data.status === "invalid"
    );
    expect(statusUpdate).toBeUndefined();
  });

  it("should mark proxy invalid when fail_count reaches threshold (3)", async () => {
    const proxy = {
      proxyId: "proxy-001",
      address: "1.2.3.4:1080",
      username: null,
      password: null,
      type: "socks5",
      deviceId: "device-001",
      failCount: 2, // Will become 3 = threshold
    };

    await manager._handleProxyFailure("serial-001", proxy, "worker-001");

    expect(proxy.failCount).toBe(3);
    const updates = mockSync.supabase._updateResults;
    const statusUpdate = updates.find(
      (u: any) => u.table === "proxies" && u.data.status === "invalid"
    );
    expect(statusUpdate).toBeDefined();
  });
});

// ── S-9: Auto-Rotate on Failure ──────────────────────────────────

describe("S-9: ProxyManager auto-rotate", () => {
  let ProxyManager: any;

  beforeEach(() => {
    ProxyManager = loadProxyManager();
  });

  it("should auto-rotate proxy when policy=rotate_on_failure and fail_count hits threshold", async () => {
    const mockXiaowei = createMockXiaowei();
    const mockBroadcaster = createMockBroadcaster();
    const mockConfig = createMockConfig("rotate_on_failure");

    // Build a more granular mock for the auto-rotate path
    const fromCalls: Array<{ table: string }> = [];
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        fromCalls.push({ table });
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({ data: null, error: null }),
          })),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnValue({
            data: [
              { id: "proxy-new", address: "5.6.7.8:1080", username: null, password: null, type: "socks5" },
            ],
            error: null,
          }),
        };
      }),
    };

    const mockSync = { supabase: mockSupabase, workerId: "w1" };
    const manager = new ProxyManager(mockXiaowei, mockSync, mockConfig, mockBroadcaster);

    const failedProxy = {
      proxyId: "proxy-old",
      address: "1.2.3.4:1080",
      username: null,
      password: null,
      type: "socks5",
      deviceId: "device-001",
      failCount: 2,
    };

    // This will increment to 3 and trigger auto-rotate
    await manager._handleProxyFailure("serial-001", failedProxy, "w1");

    // Verify auto-rotate was called: adbShell should have been called for proxy apply
    expect(mockXiaowei.adbShell).toHaveBeenCalledWith(
      "serial-001",
      "settings put global http_proxy 5.6.7.8:1080"
    );

    // Verify broadcaster was called with proxy_auto_rotated event
    expect(mockBroadcaster.publishSystemEvent).toHaveBeenCalledWith(
      "proxy_auto_rotated",
      expect.stringContaining("1.2.3.4:1080"),
      expect.objectContaining({
        serial: "serial-001",
        old_proxy: "1.2.3.4:1080",
        new_proxy: "5.6.7.8:1080",
      })
    );

    // In-memory assignment should be updated
    const assignment = manager.assignments.get("serial-001");
    expect(assignment).toBeDefined();
    expect(assignment.proxyId).toBe("proxy-new");
    expect(assignment.address).toBe("5.6.7.8:1080");
    expect(assignment.failCount).toBe(0);
  });

  it("should publish proxy_rotate_failed when no valid proxy available", async () => {
    const mockXiaowei = createMockXiaowei();
    const mockBroadcaster = createMockBroadcaster();
    const mockConfig = createMockConfig("rotate_on_failure");

    // No candidates available
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({ data: null, error: null }),
        })),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnValue({ data: [], error: null }),
      }),
    };

    const mockSync = { supabase: mockSupabase, workerId: "w1" };
    const manager = new ProxyManager(mockXiaowei, mockSync, mockConfig, mockBroadcaster);

    await manager._autoRotateProxy(
      "serial-001",
      { proxyId: "p1", address: "1.2.3.4:1080", deviceId: "d1" },
      "w1"
    );

    expect(mockBroadcaster.publishSystemEvent).toHaveBeenCalledWith(
      "proxy_rotate_failed",
      expect.stringContaining("serial-001"),
      expect.objectContaining({ serial: "serial-001" })
    );
  });

  it("should NOT auto-rotate when policy is sticky", async () => {
    const mockXiaowei = createMockXiaowei();
    const mockBroadcaster = createMockBroadcaster();
    const mockConfig = createMockConfig("sticky"); // sticky policy

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockReturnValue({ data: null, error: null }),
        })),
        eq: vi.fn().mockReturnThis(),
      }),
    };

    const mockSync = { supabase: mockSupabase, workerId: "w1" };
    const manager = new ProxyManager(mockXiaowei, mockSync, mockConfig, mockBroadcaster);

    const proxy = {
      proxyId: "proxy-001",
      address: "1.2.3.4:1080",
      username: null,
      password: null,
      type: "socks5",
      deviceId: "device-001",
      failCount: 2,
    };

    await manager._handleProxyFailure("serial-001", proxy, "w1");

    // adbShell should NOT have been called for rotation (only fail_count + invalid updates)
    expect(mockXiaowei.adbShell).not.toHaveBeenCalled();
    // No auto-rotate event
    expect(mockBroadcaster.publishSystemEvent).not.toHaveBeenCalled();
  });
});

// ── ProxyManager: applyProxy ─────────────────────────────────────

describe("ProxyManager.applyProxy", () => {
  let ProxyManager: any;

  beforeEach(() => {
    ProxyManager = loadProxyManager();
  });

  it("should call adbShell with correct proxy settings", async () => {
    const mockXiaowei = createMockXiaowei();
    const manager = new ProxyManager(mockXiaowei, createMockSupabaseSync(), createMockConfig(), null);

    const result = await manager.applyProxy("serial-001", {
      address: "10.0.0.1:8080",
      username: null,
      password: null,
      type: "http",
    });

    expect(result).toBe(true);
    expect(mockXiaowei.adbShell).toHaveBeenCalledWith(
      "serial-001",
      "settings put global http_proxy 10.0.0.1:8080"
    );
  });

  it("should return false when Xiaowei is disconnected", async () => {
    const mockXiaowei = createMockXiaowei(false);
    const manager = new ProxyManager(mockXiaowei, createMockSupabaseSync(), createMockConfig(), null);

    const result = await manager.applyProxy("serial-001", {
      address: "10.0.0.1:8080",
    });

    expect(result).toBe(false);
  });

  it("should return false for invalid proxy address (no port)", async () => {
    const mockXiaowei = createMockXiaowei();
    const manager = new ProxyManager(mockXiaowei, createMockSupabaseSync(), createMockConfig(), null);

    const result = await manager.applyProxy("serial-001", {
      address: "10.0.0.1",
      username: null,
      password: null,
      type: "socks5",
    });

    expect(result).toBe(false);
  });
});

// ── ProxyManager: Check loop guard ───────────────────────────────

describe("ProxyManager check loop", () => {
  let ProxyManager: any;

  beforeEach(() => {
    ProxyManager = loadProxyManager();
  });

  it("should skip check cycle when Xiaowei is offline", async () => {
    const mockXiaowei = createMockXiaowei(false);
    const mockSync = createMockSupabaseSync();
    const manager = new ProxyManager(mockXiaowei, mockSync, createMockConfig(), null);

    // Should not throw
    await manager._runCheckCycle("worker-001");

    // supabase.from should not be called for proxy queries
    expect(mockSync.supabase.from).not.toHaveBeenCalled();
  });

  it("should prevent overlapping check cycles via guard flag", async () => {
    const mockXiaowei = createMockXiaowei(false);
    const manager = new ProxyManager(mockXiaowei, createMockSupabaseSync(), createMockConfig(), null);

    manager._checkRunning = true;
    await manager._runCheckCycle("worker-001");
    // Should have returned early, _checkRunning still true
    expect(manager._checkRunning).toBe(true);
  });

  it("should reset guard flag after cycle completes", async () => {
    const mockXiaowei = createMockXiaowei(false);
    const manager = new ProxyManager(mockXiaowei, createMockSupabaseSync(), createMockConfig(), null);

    expect(manager._checkRunning).toBe(false);
    await manager._runCheckCycle("worker-001");
    expect(manager._checkRunning).toBe(false);
  });
});

// ── ProxyManager: config change handling ─────────────────────────

describe("ProxyManager.applyConfigChange", () => {
  let ProxyManager: any;

  beforeEach(() => {
    ProxyManager = loadProxyManager();
  });

  it("should restart check interval on proxy_check_interval change", () => {
    vi.useFakeTimers();
    const manager = new ProxyManager(createMockXiaowei(), createMockSupabaseSync(), createMockConfig(), null);

    // Simulate having an active check handle
    manager._checkHandle = setInterval(() => {}, 300000);

    manager.applyConfigChange("proxy_check_interval", 60000);

    // Check handle should be replaced (not null)
    expect(manager._checkHandle).not.toBeNull();

    clearInterval(manager._checkHandle);
    vi.useRealTimers();
  });

  it("should start daily rotate timer when policy changes to rotate_daily", () => {
    vi.useFakeTimers();
    const manager = new ProxyManager(createMockXiaowei(), createMockSupabaseSync(), createMockConfig(), null);
    manager.supabaseSync = { workerId: "w1" };

    expect(manager._dailyRotateHandle).toBeNull();
    manager.applyConfigChange("proxy_policy", "rotate_daily");
    expect(manager._dailyRotateHandle).not.toBeNull();

    clearInterval(manager._dailyRotateHandle);
    vi.useRealTimers();
  });

  it("should stop daily rotate timer when policy changes away from rotate_daily", () => {
    vi.useFakeTimers();
    const manager = new ProxyManager(createMockXiaowei(), createMockSupabaseSync(), createMockConfig("rotate_daily"), null);
    manager.supabaseSync = { workerId: "w1" };

    // Start it first
    manager.applyConfigChange("proxy_policy", "rotate_daily");
    expect(manager._dailyRotateHandle).not.toBeNull();

    // Change away
    manager.applyConfigChange("proxy_policy", "sticky");
    expect(manager._dailyRotateHandle).toBeNull();

    vi.useRealTimers();
  });
});
