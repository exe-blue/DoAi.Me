"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Link,
  Unlink,
  Wand2,
  Globe,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  StatusDot,
  StatusBadge,
  statusTextClass,
  statusBorderClass,
  statusBgSubtleClass,
  statusBadgeClass,
} from "@/components/ui/status-indicator";
import { useProxiesStore } from "@/hooks/use-proxies-store";
import { useWorkersStore } from "@/hooks/use-workers-store";
import type { NodePC, Device, Proxy, ProxyType } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ProxiesPageProps {
  nodes: NodePC[];
}

export function ProxiesPage({ nodes }: ProxiesPageProps) {
  const { proxies, loading, fetch: fetchProxies, create, remove, assign, autoAssign } = useProxiesStore();
  const fetchWorkers = useWorkersStore((s) => s.fetch);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogNodeId, setAddDialogNodeId] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assigningProxyId, setAssigningProxyId] = useState<string | null>(null);

  // Add proxy form state
  const [selectedNodeId, setSelectedNodeId] = useState<string>("__none__");
  const [proxyType, setProxyType] = useState<ProxyType>("socks5");
  const [proxyListText, setProxyListText] = useState("");

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const openAddDialog = (nodeId?: string) => {
    setAddDialogNodeId(nodeId ?? null);
    setSelectedNodeId(nodeId ?? "__none__");
    setProxyType("socks5");
    setProxyListText("");
    setAddDialogOpen(true);
  };

  const handleAddProxies = async () => {
    const lines = proxyListText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const workerId = selectedNodeId && selectedNodeId !== "__none__" ? selectedNodeId : undefined;

    try {
      for (const address of lines) {
        await create({
          address,
          type: proxyType,
          worker_id: workerId,
        });
      }
      setAddDialogOpen(false);
    } catch {
      // Toast already shown by store
    }
  };

  const handleRemoveProxy = async (proxyId: string) => {
    await remove(proxyId);
    fetchWorkers();
  };

  const handleUnassignProxy = async (proxyId: string) => {
    await assign(proxyId, null);
    fetchWorkers();
  };

  const openAssignDialog = (proxyId: string) => {
    setAssigningProxyId(proxyId);
    setAssignDialogOpen(true);
  };

  const handleAssignToDevice = async (deviceId: string) => {
    if (!assigningProxyId) return;
    await assign(assigningProxyId, deviceId);
    fetchWorkers();
    setAssignDialogOpen(false);
    setAssigningProxyId(null);
  };

  const handleAutoAssign = async (nodeId: string) => {
    await autoAssign(nodeId);
    fetchWorkers();
  };

  // Build device map with proxy info
  const deviceMap = useMemo(() => {
    const map = new Map<string, Device & { proxyId?: string | null }>();
    for (const node of nodes) {
      for (const device of node.devices) {
        const proxy = proxies.find((p) => p.deviceId === device.id);
        map.set(device.id, { ...device, proxyId: proxy?.id ?? null });
      }
    }
    return map;
  }, [nodes, proxies]);

  // Stats
  const stats = useMemo(() => {
    const total = proxies.length;
    const assigned = proxies.filter((p) => p.deviceId !== null).length;
    const unassigned = total - assigned;
    return { total, assigned, unassigned };
  }, [proxies]);

  // Group proxies by node
  const nodeProxies = useMemo(() => {
    const grouped = new Map<string, Proxy[]>();
    for (const node of nodes) {
      grouped.set(
        node.id,
        proxies.filter((p) => p.workerId === node.id)
      );
    }
    return grouped;
  }, [nodes, proxies]);

  // Unassigned proxies (no workerId)
  const unassignedProxies = useMemo(() => {
    return proxies.filter((p) => p.workerId === null);
  }, [proxies]);

  const proxyListLines = useMemo(() => {
    return proxyListText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }, [proxyListText]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">프록시 설정</h1>
          <p className="text-sm text-muted-foreground">
            노드별 프록시 할당을 관리합니다. 1기기 1프록시 원칙.
          </p>
        </div>
        <Button onClick={() => openAddDialog()} className="gap-1.5">
          <Plus className="h-4 w-4" />
          프록시 등록
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">총 {stats.total}개</span>
        <StatusBadge variant="success">할당됨 {stats.assigned}</StatusBadge>
        <StatusBadge variant="neutral">미할당 {stats.unassigned}</StatusBadge>
      </div>

      {/* Nodes */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-3">
          {nodes.map((node) => {
            const nodePxs = nodeProxies.get(node.id) ?? [];
            const assignedPxs = nodePxs.filter((p) => p.deviceId !== null);
            const unassignedPxs = nodePxs.filter((p) => p.deviceId === null);
            const devicesWithProxy = node.devices.filter((d) =>
              proxies.some((p) => p.deviceId === d.id)
            );
            const devicesWithoutProxy = node.devices.filter(
              (d) => !proxies.some((p) => p.deviceId === d.id)
            );
            const shortfall = devicesWithoutProxy.length;
            const isExpanded = expandedNodes.has(node.id);

            return (
              <div
                key={node.id}
                className={cn(
                  "rounded-md border bg-card p-2",
                  statusBorderClass("neutral")
                )}
              >
                {/* Node Header */}
                <button
                  onClick={() => toggleNode(node.id)}
                  className="flex w-full items-center gap-2 text-left hover:opacity-80"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className="font-medium">
                    {node.name} ({node.id})
                  </span>
                  <StatusDot
                    variant={node.status === "connected" ? "success" : "neutral"}
                  />
                  <div className="flex items-center gap-1.5 text-xs">
                    <StatusBadge variant="info">
                      기기 {node.devices.length}
                    </StatusBadge>
                    <StatusBadge variant="neutral">
                      프록시 {nodePxs.length}
                    </StatusBadge>
                    <StatusBadge variant="success">
                      할당됨 {assignedPxs.length}
                    </StatusBadge>
                    {shortfall > 0 && (
                      <StatusBadge variant="error">부족 {shortfall}</StatusBadge>
                    )}
                  </div>
                </button>

                {/* Node Content */}
                {isExpanded && (
                  <div className="mt-3 space-y-3 pl-6">
                    {/* A) Proxies Assigned to Devices */}
                    {assignedPxs.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                          프록시 적용됨
                        </h3>
                        <div className="space-y-1.5">
                          {assignedPxs.map((px) => {
                            const device = deviceMap.get(px.deviceId!);
                            return (
                              <div
                                key={px.id}
                                className={cn(
                                  "flex items-center gap-2 rounded border p-2 text-sm",
                                  statusBorderClass("success")
                                )}
                              >
                                <ProxyTypeBadge type={px.type} />
                                <code className="flex-1 font-mono text-xs">
                                  {px.address}
                                </code>
                                <span className="text-muted-foreground">→</span>
                                <span
                                  className={cn(
                                    "font-mono text-xs",
                                    statusTextClass("success")
                                  )}
                                >
                                  {device?.nickname || device?.serial || "Unknown"}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleUnassignProxy(px.id)}
                                  className="h-7 gap-1 px-2"
                                >
                                  <Unlink className="h-3 w-3" />
                                  할당해제
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveProxy(px.id)}
                                  className="h-7 gap-1 px-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  삭제
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* B) Devices Without Proxy */}
                    {devicesWithoutProxy.length > 0 && (
                      <div>
                        <h3
                          className={cn(
                            "mb-2 rounded px-2 py-1 text-xs font-medium",
                            statusBgSubtleClass("error")
                          )}
                        >
                          미적용 기기 ({devicesWithoutProxy.length})
                        </h3>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
                          {devicesWithoutProxy.map((device) => (
                            <div
                              key={device.id}
                              className={cn(
                                "rounded border p-2 text-xs",
                                statusBorderClass("neutral")
                              )}
                            >
                              <div className="truncate font-mono">
                                {device.nickname || device.serial}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unassigned Proxies for This Node */}
                    {unassignedPxs.length > 0 && (
                      <div>
                        <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                          미할당 프록시 ({unassignedPxs.length})
                        </h3>
                        <div className="space-y-1.5">
                          {unassignedPxs.map((px) => (
                            <div
                              key={px.id}
                              className={cn(
                                "flex items-center gap-2 rounded border p-2 text-sm",
                                statusBorderClass("neutral")
                              )}
                            >
                              <ProxyTypeBadge type={px.type} />
                              <code className="flex-1 font-mono text-xs">
                                {px.address}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openAssignDialog(px.id)}
                                className="h-7 gap-1 px-2"
                              >
                                <Link className="h-3 w-3" />
                                할당
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveProxy(px.id)}
                                className="h-7 gap-1 px-2"
                              >
                                <Trash2 className="h-3 w-3" />
                                삭제
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex items-center gap-2 border-t pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAutoAssign(node.id)}
                        disabled={unassignedPxs.length === 0}
                        className="gap-1.5"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        자동 할당
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openAddDialog(node.id)}
                        className="gap-1.5"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        프록시 추가
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned Proxies Section */}
          {unassignedProxies.length > 0 && (
            <div
              className={cn(
                "rounded-md border bg-card p-2",
                statusBorderClass("neutral")
              )}
            >
              <button
                onClick={() => toggleNode("__unassigned__")}
                className="flex w-full items-center gap-2 text-left hover:opacity-80"
              >
                {expandedNodes.has("__unassigned__") ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="font-medium">미배정 프록시</span>
                <StatusBadge variant="neutral">
                  {unassignedProxies.length}개
                </StatusBadge>
              </button>

              {expandedNodes.has("__unassigned__") && (
                <div className="mt-3 space-y-1.5 pl-6">
                  {unassignedProxies.map((px) => (
                    <div
                      key={px.id}
                      className={cn(
                        "flex items-center gap-2 rounded border p-2 text-sm",
                        statusBorderClass("neutral")
                      )}
                    >
                      <ProxyTypeBadge type={px.type} />
                      <code className="flex-1 font-mono text-xs">
                        {px.address}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveProxy(px.id)}
                        className="h-7 gap-1 px-2"
                      >
                        <Trash2 className="h-3 w-3" />
                        삭제
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Add Proxy Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>프록시 등록</DialogTitle>
            <DialogDescription>
              노드를 선택하고 프록시 목록을 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                노드 선택
              </label>
              <Select
                value={selectedNodeId}
                onValueChange={setSelectedNodeId}
                disabled={addDialogNodeId !== null}
              >
                <SelectTrigger>
                  <SelectValue placeholder="노드를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">전체 (미배정)</SelectItem>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.name} ({node.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                프록시 유형
              </label>
              <Select
                value={proxyType}
                onValueChange={(v) => setProxyType(v as ProxyType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="socks5">SOCKS5</SelectItem>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                프록시 목록
              </label>
              <Textarea
                value={proxyListText}
                onChange={(e) => setProxyListText(e.target.value)}
                placeholder="host:port&#10;user:pass@host:port"
                className="font-mono text-xs"
                rows={8}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                지원 형식: host:port, user:pass@host:port
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddProxies}
              disabled={proxyListLines.length === 0}
            >
              등록 ({proxyListLines.length}개)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>기기 선택</DialogTitle>
            <DialogDescription>
              프록시를 할당할 기기를 선택하세요 (프록시 미할당 기기만 표시됩니다).
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-1.5 pr-3">
              {Array.from(deviceMap.values())
                .filter((d) => !d.proxyId)
                .map((device) => (
                  <button
                    key={device.id}
                    onClick={() => handleAssignToDevice(device.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded border p-2 text-left text-sm hover:bg-accent",
                      statusBorderClass("neutral")
                    )}
                  >
                    <StatusDot
                      variant={
                        device.status === "online"
                          ? "success"
                          : device.status === "running"
                            ? "warning"
                            : device.status === "error"
                              ? "error"
                              : "neutral"
                      }
                    />
                    <div className="flex-1">
                      <div className="font-mono text-xs">
                        {device.nickname || device.serial}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {device.ip}
                      </div>
                    </div>
                  </button>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProxyTypeBadge({ type }: { type: ProxyType }) {
  const Icon = type === "https" ? Shield : Globe;
  const variant =
    type === "socks5" ? "info" : type === "http" ? "warning" : "success";

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
        statusBadgeClass(variant)
      )}
    >
      <Icon className="h-3 w-3" />
      {type.toUpperCase()}
    </div>
  );
}
