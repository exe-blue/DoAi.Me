"use client";

import { useState, useMemo } from "react";
import {
  Monitor,
  Wifi,
  WifiOff,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { NodePC, Device, DeviceStatus } from "@/lib/types";

function getStatusColor(status: DeviceStatus) {
  switch (status) {
    case "online":
      return "bg-emerald-500";
    case "running":
      return "bg-amber-400";
    case "offline":
      return "bg-zinc-600";
    case "error":
      return "bg-red-500";
  }
}

function getStatusBorder(status: DeviceStatus) {
  switch (status) {
    case "online":
      return "border-emerald-500/40";
    case "running":
      return "border-amber-400/40";
    case "offline":
      return "border-zinc-600/40";
    case "error":
      return "border-red-500/40";
  }
}

function getStatusLabel(status: DeviceStatus) {
  switch (status) {
    case "online":
      return "정상";
    case "running":
      return "실행 중";
    case "offline":
      return "오프라인";
    case "error":
      return "오류";
  }
}

function DeviceCell({ device }: { device: Device }) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-start justify-between rounded-md border p-2 transition-all hover:brightness-125",
        getStatusBorder(device.status),
        "bg-card",
      )}
      style={{ minWidth: 0 }}
    >
      <div
        className={cn(
          "absolute right-1.5 top-1.5 h-2 w-2 rounded-full",
          getStatusColor(device.status),
        )}
      />
      <span className="truncate text-[11px] font-mono text-muted-foreground w-full">
        {device.ip}
      </span>
      <span className="truncate text-[11px] font-mono text-foreground/70 w-full">
        {device.serial}
      </span>
      {device.currentTask ? (
        <span className="mt-0.5 truncate text-[10px] text-amber-400 w-full">
          {device.currentTask}
        </span>
      ) : (
        <span className="mt-0.5 text-[10px] text-muted-foreground">
          {getStatusLabel(device.status)}
        </span>
      )}
    </div>
  );
}

function NodeSection({
  node,
  search,
  defaultOpen,
}: {
  node: NodePC;
  search: string;
  defaultOpen: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const filteredDevices = useMemo(() => {
    if (!search) return node.devices;
    const q = search.toLowerCase();
    return node.devices.filter(
      (d) =>
        d.ip.toLowerCase().includes(q) ||
        d.serial.toLowerCase().includes(q) ||
        d.id.toLowerCase().includes(q) ||
        (d.currentTask && d.currentTask.toLowerCase().includes(q)),
    );
  }, [node.devices, search]);

  const stats = useMemo(() => {
    const s = { online: 0, running: 0, offline: 0, error: 0 };
    for (const d of node.devices) {
      s[d.status]++;
    }
    return s;
  }, [node.devices]);

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 hover:bg-secondary/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-foreground" />
            <span className="font-medium text-sm text-foreground">
              {node.name}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              ({node.id})
            </span>
          </div>
          {node.status === "connected" ? (
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-red-400" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-xs border-emerald-500/30 text-emerald-400"
          >
            {stats.online}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs border-amber-500/30 text-amber-400"
          >
            {stats.running}
          </Badge>
          <Badge
            variant="outline"
            className="text-xs border-zinc-500/30 text-zinc-400"
          >
            {stats.offline}
          </Badge>
          {stats.error > 0 && (
            <Badge
              variant="outline"
              className="text-xs border-red-500/30 text-red-400"
            >
              {stats.error}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground ml-1">
            {node.devices.length}대
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-10">
            {filteredDevices.map((device) => (
              <DeviceCell key={device.id} device={device} />
            ))}
          </div>
          {filteredDevices.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function DevicesPage({ nodes }: { nodes: NodePC[] }) {
  const [search, setSearch] = useState("");

  const totalStats = useMemo(() => {
    const s = { online: 0, running: 0, offline: 0, error: 0, total: 0 };
    for (const n of nodes) {
      for (const d of n.devices) {
        s[d.status]++;
        s.total++;
      }
    }
    return s;
  }, [nodes]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">디바이스</h1>
          <p className="text-sm text-muted-foreground">
            {nodes.length}개 노드 / {totalStats.total}대 기기 관제
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-sm text-muted-foreground">
                정상 {totalStats.online}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="text-sm text-muted-foreground">
                실행중 {totalStats.running}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
              <span className="text-sm text-muted-foreground">
                오프라인 {totalStats.offline}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-sm text-muted-foreground">
                오류 {totalStats.error}
              </span>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="IP, 시리얼, 작업 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 text-xs bg-secondary"
            />
          </div>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="flex flex-col gap-3 pr-3">
          {nodes.map((node, i) => (
            <NodeSection
              key={node.id}
              node={node}
              search={search}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
