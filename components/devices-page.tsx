"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Monitor,
  Wifi,
  WifiOff,
  Search,
  ChevronDown,
  ChevronRight,
  Edit2,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StatusDot,
  StatusBadge,
  statusBorderClass,
  type StatusVariant,
} from "@/components/ui/status-indicator";
import { cn } from "@/lib/utils";
import type { NodePC, Device, DeviceStatus } from "@/lib/types";
import { useWorkersStore } from "@/hooks/use-workers-store";

/**
 * Maps DeviceStatus to semantic StatusVariant.
 */
function mapDeviceStatusToVariant(status: DeviceStatus): StatusVariant {
  switch (status) {
    case "online":
      return "success";
    case "running":
      return "warning";
    case "offline":
      return "neutral";
    case "error":
      return "error";
  }
}

/**
 * Korean labels for device status.
 */
function getStatusLabel(status: DeviceStatus): string {
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

/**
 * DeviceCell — compact monitoring card.
 *
 * Layout:
 *   ● nickname/IP
 *   serial
 *   task or status
 *   🔒 proxy (if proxyId present)
 *
 * On hover: border brightens, status dot → ⋮ dropdown menu.
 */
function DeviceCell({
  device,
  onEdit,
  onDelete,
}: {
  device: Device;
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
}) {
  const variant = mapDeviceStatusToVariant(device.status);

  return (
    <div
      className={cn(
        "group relative flex flex-col items-start justify-between rounded-md border p-2 transition-all",
        "bg-card hover:bg-secondary/50",
        statusBorderClass(variant),
        "hover:brightness-125",
      )}
      style={{ minWidth: 0 }}
    >
      {/* Status Dot (hidden on hover) */}
      <div className="absolute right-1.5 top-1.5 group-hover:hidden">
        <StatusDot variant={variant} size="sm" />
      </div>

      {/* Dropdown Menu (visible on hover) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground group-hover:block"
            aria-label="디바이스 메뉴"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem onClick={() => onEdit(device)}>
            <Edit2 className="h-3.5 w-3.5 mr-2" />
            수정
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(device)}
            className="text-status-error focus:text-status-error"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Primary Label: nickname or IP */}
      <span className="truncate text-xs font-mono text-muted-foreground w-full">
        {device.nickname || device.ip}
      </span>

      {/* Serial */}
      <span className="truncate text-xs font-mono text-foreground/70 w-full">
        {device.serial}
      </span>

      {/* Task or Status */}
      {device.currentTask ? (
        <span className="mt-0.5 truncate text-[11px] text-status-warning w-full">
          {device.currentTask}
        </span>
      ) : (
        <span className="mt-0.5 text-[11px] text-muted-foreground">
          {getStatusLabel(device.status)}
        </span>
      )}

      {/* Proxy Indicator (if device has a proxy assigned) */}
      {/* Note: Device type doesn't have proxyId field yet, but including for future-proofing */}
      {/* Uncomment when proxyId is added to Device type:
      {device.proxyId && (
        <div className="mt-0.5 flex items-center gap-1">
          <Shield className="h-2.5 w-2.5 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60">프록시</span>
        </div>
      )}
      */}
    </div>
  );
}

/**
 * NodeSection — collapsible node with device grid.
 */
function NodeSection({
  node,
  search,
  defaultOpen,
  onEdit,
  onDelete,
}: {
  node: NodePC;
  search: string;
  defaultOpen: boolean;
  onEdit: (device: Device) => void;
  onDelete: (device: Device) => void;
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
        (d.nickname && d.nickname.toLowerCase().includes(q)) ||
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
            <span className="font-medium text-base text-foreground">
              {node.name}
            </span>
            <span className="text-sm font-mono text-muted-foreground">
              ({node.id})
            </span>
          </div>
          {node.status === "connected" ? (
            <Wifi className="h-3.5 w-3.5 text-status-success" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-status-error" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant="success">{stats.online}</StatusBadge>
          <StatusBadge variant="warning">{stats.running}</StatusBadge>
          <StatusBadge variant="neutral">{stats.offline}</StatusBadge>
          {stats.error > 0 && (
            <StatusBadge variant="error">{stats.error}</StatusBadge>
          )}
          <span className="text-base text-muted-foreground ml-1">
            {node.devices.length}대
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border p-3">
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(110px,1fr))]">
            {filteredDevices.map((device) => (
              <DeviceCell
                key={device.id}
                device={device}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
          {filteredDevices.length === 0 && (
            <p className="py-8 text-center text-base text-muted-foreground">
              검색 결과가 없습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * DevicesPage — main component.
 */
export function DevicesPage({ nodes }: { nodes: NodePC[] }) {
  const [search, setSearch] = useState("");
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const fetchWorkers = useWorkersStore((s) => s.fetch);

  const handleDeviceEdit = useCallback((device: Device) => {
    setEditingDevice(device);
    setEditNickname(device.nickname || "");
  }, []);

  const handleDeviceDelete = useCallback(
    async (device: Device) => {
      if (
        !confirm(
          `디바이스 ${device.nickname || device.ip || device.serial}을(를) 삭제하시겠습니까?`,
        )
      )
        return;
      try {
        const res = await fetch(`/api/devices/${device.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("삭제 실패");
        fetchWorkers();
      } catch (err) {
        console.error("Device delete error:", err);
      }
    },
    [fetchWorkers],
  );

  const handleDeviceSave = useCallback(async () => {
    if (!editingDevice) return;
    try {
      const res = await fetch(`/api/devices/${editingDevice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: editNickname || null }),
      });
      if (!res.ok) throw new Error("수정 실패");
      setEditingDevice(null);
      fetchWorkers();
    } catch (err) {
      console.error("Device edit error:", err);
    }
  }, [editingDevice, editNickname, fetchWorkers]);

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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">디바이스</h1>
          <p className="text-base text-muted-foreground">
            {nodes.length}개 노드 / {totalStats.total}대 기기 관제
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Summary with StatusDot */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <StatusDot variant="success" size="md" />
              <span className="text-base text-muted-foreground">
                정상 {totalStats.online}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot variant="warning" size="md" />
              <span className="text-base text-muted-foreground">
                실행중 {totalStats.running}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot variant="neutral" size="md" />
              <span className="text-base text-muted-foreground">
                오프라인 {totalStats.offline}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot variant="error" size="md" />
              <span className="text-base text-muted-foreground">
                오류 {totalStats.error}
              </span>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="IP, 시리얼, 작업 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 pl-8 text-sm bg-secondary"
            />
          </div>
        </div>
      </div>

      {/* Node Sections */}
      <ScrollArea className="h-[calc(100vh-180px)]">
        <div className="flex flex-col gap-3 pr-3">
          {nodes.map((node, i) => (
            <NodeSection
              key={node.id}
              node={node}
              search={search}
              defaultOpen={i === 0}
              onEdit={handleDeviceEdit}
              onDelete={handleDeviceDelete}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Edit Device Dialog */}
      <Dialog
        open={!!editingDevice}
        onOpenChange={() => setEditingDevice(null)}
      >
        <DialogContent className="max-w-sm bg-card">
          <DialogHeader>
            <DialogTitle className="text-lg">디바이스 수정</DialogTitle>
            <DialogDescription className="text-base">
              디바이스의 별명을 변경합니다.
            </DialogDescription>
          </DialogHeader>
          {editingDevice && (
            <div className="flex flex-col gap-3 py-2">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  시리얼
                </label>
                <Input
                  value={editingDevice.serial}
                  readOnly
                  className="bg-secondary text-muted-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  IP
                </label>
                <Input
                  value={editingDevice.ip}
                  readOnly
                  className="bg-secondary text-muted-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  별명
                </label>
                <Input
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  placeholder="별명을 입력하세요"
                  className="bg-secondary"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingDevice(null)}
            >
              취소
            </Button>
            <Button onClick={handleDeviceSave}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
