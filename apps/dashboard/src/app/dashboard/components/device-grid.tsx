"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface DeviceInfo {
  serial: string;
  name?: string;
  status: "online" | "busy" | "offline" | "error";
  model?: string;
  battery?: number;
  worker_id?: string;
}

interface DeviceGridProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const STATUS_COLORS: Record<DeviceInfo["status"], string> = {
  online: "bg-green-500",
  busy: "bg-yellow-500",
  offline: "bg-gray-600",
  error: "bg-red-500",
};

const STATUS_LABELS: Record<DeviceInfo["status"], string> = {
  online: "온라인",
  busy: "작업중",
  offline: "오프라인",
  error: "에러",
};

function DeviceCell({ device }: { device: DeviceInfo }) {
  return (
    <div className="group relative">
      <div
        className={`h-3 w-3 rounded-sm ${STATUS_COLORS[device.status]} transition-transform duration-150 group-hover:scale-150`}
      />
      {/* CSS-only tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-lg border border-[#1e2028] bg-[#1a1d24] px-3 py-2 text-xs opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100">
        <div className="whitespace-nowrap">
          <p className="font-mono text-gray-300">{device.serial}</p>
          {device.model && (
            <p className="text-gray-500">{device.model}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[device.status]}`}
            />
            <span className="text-gray-400">
              {STATUS_LABELS[device.status]}
            </span>
            {device.battery != null && (
              <span className="text-gray-500">{device.battery}%</span>
            )}
          </div>
        </div>
        {/* Tooltip arrow */}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1a1d24]" />
      </div>
    </div>
  );
}

export function DeviceGrid({ supabaseUrl, supabaseAnonKey }: DeviceGridProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const supabaseRef = useRef<SupabaseClient | null>(null);

  const handleBroadcast = useCallback(
    (msg: {
      payload: {
        worker_id: string;
        devices: Array<{
          serial: string;
          status: string;
          model?: string;
          battery?: number;
        }>;
      };
    }) => {
      const { worker_id, devices: incoming } = msg.payload;
      setDevices((prev) => {
        const updated = new Map(prev.map((d) => [d.serial, d]));
        for (const d of incoming) {
          updated.set(d.serial, {
            serial: d.serial,
            status: (d.status as DeviceInfo["status"]) || "offline",
            model: d.model,
            battery: d.battery,
            worker_id,
          });
        }
        return Array.from(updated.values());
      });
    },
    []
  );

  useEffect(() => {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    supabaseRef.current = client;

    // Fetch initial device list
    fetch("/api/devices")
      .then((res) => res.json())
      .then((json: { success: boolean; data?: Array<{ serial: string; status: string; model?: string; battery_level?: number; worker_id?: string }> }) => {
        if (json.success && json.data) {
          setDevices(
            json.data.map((d) => ({
              serial: d.serial,
              status: (d.status as DeviceInfo["status"]) || "offline",
              model: d.model,
              battery: d.battery_level,
              worker_id: d.worker_id,
            }))
          );
        }
      })
      .catch(() => {
        // silent — grid will stay empty until broadcast data arrives
      });

    // Subscribe to broadcast
    const channel = client.channel("room:devices");
    channel.on("broadcast", { event: "update" }, handleBroadcast);
    channel.subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseAnonKey, handleBroadcast]);

  const counts = useMemo(() => {
    const c = { online: 0, busy: 0, offline: 0, error: 0 };
    for (const d of devices) {
      c[d.status]++;
    }
    return c;
  }, [devices]);

  return (
    <div className="rounded-xl border border-[#1e2028] bg-[#111318] p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-semibold text-white">
          디바이스 그리드 ({devices.length}대)
        </h3>
        <div className="flex gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            온라인 {counts.online}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            작업중 {counts.busy}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-gray-600" />
            오프라인 {counts.offline}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            에러 {counts.error}
          </span>
        </div>
      </div>

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(12px, 1fr))",
          contentVisibility: "auto",
          containIntrinsicSize: "auto 300px",
        }}
      >
        {devices.map((device) => (
          <DeviceCell key={device.serial} device={device} />
        ))}
        {devices.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-gray-500">
            디바이스 데이터를 불러오는 중...
          </p>
        )}
      </div>
    </div>
  );
}
