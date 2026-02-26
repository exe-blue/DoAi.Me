"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import { StatsCards } from "./components/stats-cards";
import { DeviceGrid } from "./components/device-grid";
import { SystemAlerts } from "./components/system-alerts";

interface DashboardStats {
  workers_online: number | null;
  workers_total: number | null;
  devices_online: number | null;
  devices_total: number | null;
  devices_busy: number | null;
  devices_offline: number | null;
  devices_error: number | null;
  tasks_running: number | null;
  tasks_pending: number | null;
  tasks_completed_24h: number | null;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const defaultStats: DashboardStats = {
  workers_online: null,
  workers_total: null,
  devices_online: null,
  devices_total: null,
  devices_busy: null,
  devices_offline: null,
  devices_error: null,
  tasks_running: null,
  tasks_pending: null,
  tasks_completed_24h: null,
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
      }
    } catch {
      // silently fail — will retry on next broadcast
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel("room:dashboard")
      .on("broadcast", { event: "stats_update" }, (payload) => {
        if (payload.payload) {
          setStats((prev) => ({ ...prev, ...payload.payload }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            YouTube Agent Farm 실시간 모니터링
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-400">LIVE</span>
        </div>
      </div>

      {/* Stat cards — NumberTicker animated */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#1e2028] bg-[#111318] p-5"
            >
              <div className="mb-3 h-4 w-24 animate-pulse rounded bg-white/5" />
              <div className="h-8 w-16 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : (
        <StatsCards stats={stats} />
      )}

      {/* 2-column layout: device grid + system alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DeviceGrid
            supabaseUrl={SUPABASE_URL}
            supabaseAnonKey={SUPABASE_ANON_KEY}
          />
        </div>
        <div className="lg:col-span-1">
          <SystemAlerts
            supabaseUrl={SUPABASE_URL}
            supabaseAnonKey={SUPABASE_ANON_KEY}
          />
        </div>
      </div>
    </div>
  );
}
