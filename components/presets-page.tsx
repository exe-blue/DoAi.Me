"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Plus,
  ArrowUpDown,
  Terminal,
  FileCode,
  Clock,
  Play,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  Monitor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CommandPreset, CommandHistory, NodePC } from "@/lib/types";

// Device Selector Dialog
function DeviceSelector({
  open,
  onClose,
  nodes,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  nodes: NodePC[];
  onConfirm: (selections: { nodeId: string; deviceIds: string[] }[]) => void;
}) {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<
    Map<string, Set<string>>
  >(new Map());
  const [dragStart, setDragStart] = useState<number | null>(null);

  const toggleNode = (nodeId: string) => {
    setExpandedNode(expandedNode === nodeId ? null : nodeId);
  };

  const selectAllNode = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newMap = new Map(selectedDevices);
    const current = newMap.get(nodeId);
    if (current && current.size === node.devices.length) {
      newMap.delete(nodeId);
    } else {
      newMap.set(
        nodeId,
        new Set(node.devices.map((d) => d.id)),
      );
    }
    setSelectedDevices(newMap);
  };

  const toggleDevice = (nodeId: string, deviceId: string) => {
    const newMap = new Map(selectedDevices);
    const set = new Set(newMap.get(nodeId) || []);
    if (set.has(deviceId)) {
      set.delete(deviceId);
    } else {
      set.add(deviceId);
    }
    if (set.size > 0) {
      newMap.set(nodeId, set);
    } else {
      newMap.delete(nodeId);
    }
    setSelectedDevices(newMap);
  };

  const handleRangeSelect = (nodeId: string, endIdx: number) => {
    if (dragStart === null) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const start = Math.min(dragStart, endIdx);
    const end = Math.max(dragStart, endIdx);
    const newMap = new Map(selectedDevices);
    const set = new Set(newMap.get(nodeId) || []);
    for (let i = start; i <= end; i++) {
      set.add(node.devices[i].id);
    }
    newMap.set(nodeId, set);
    setSelectedDevices(newMap);
  };

  const totalSelected = useMemo(() => {
    let count = 0;
    for (const s of selectedDevices.values()) count += s.size;
    return count;
  }, [selectedDevices]);

  const handleConfirm = () => {
    const selections: { nodeId: string; deviceIds: string[] }[] = [];
    for (const [nodeId, deviceSet] of selectedDevices) {
      selections.push({ nodeId, deviceIds: Array.from(deviceSet) });
    }
    onConfirm(selections);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle>기기 선택</DialogTitle>
          <DialogDescription>
            명령을 내릴 디바이스를 선택하세요. Ctrl/Shift 클릭 또는 드래그로
            여러 기기를 선택할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-96">
          <div className="flex flex-col gap-2 pr-3">
            {nodes.map((node) => {
              const nodeSelected = selectedDevices.get(node.id);
              const isExpanded = expandedNode === node.id;
              const allSelected =
                nodeSelected && nodeSelected.size === node.devices.length;

              return (
                <div key={node.id} className="rounded-md border border-border">
                  <div className="flex items-center gap-2 p-2">
                    <button
                      type="button"
                      onClick={() => toggleNode(node.id)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="text-sm font-medium">{node.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({node.devices.length}대)
                      </span>
                    </button>
                    <Button
                      size="sm"
                      variant={allSelected ? "default" : "outline"}
                      className="h-6 text-[10px] px-2"
                      onClick={() => selectAllNode(node.id)}
                    >
                      {allSelected ? "전체해제" : "전체선택"}
                    </Button>
                    {nodeSelected && nodeSelected.size > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-primary/30 text-primary"
                      >
                        {nodeSelected.size}개
                      </Badge>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border p-2">
                      <div className="grid grid-cols-10 gap-1">
                        {node.devices.map((device, idx) => {
                          const isSelected = nodeSelected?.has(device.id);
                          return (
                            <button
                              type="button"
                              key={device.id}
                              className={cn(
                                "flex items-center justify-center rounded border p-1 text-[9px] font-mono transition-all cursor-pointer",
                                isSelected
                                  ? "border-primary bg-primary/20 text-primary"
                                  : "border-border bg-secondary hover:border-muted-foreground text-muted-foreground",
                              )}
                              onClick={(e) => {
                                if (e.shiftKey && dragStart !== null) {
                                  handleRangeSelect(node.id, idx);
                                } else {
                                  toggleDevice(node.id, device.id);
                                  setDragStart(idx);
                                }
                              }}
                              title={`${device.ip} / ${device.serial}`}
                            >
                              {isSelected && (
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                              )}
                              {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {totalSelected}개 기기 선택됨
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button onClick={handleConfirm} disabled={totalSelected === 0}>
              선택 완료
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add Preset Dialog
function AddPresetDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card">
        <DialogHeader>
          <DialogTitle>명령 프리셋 등록</DialogTitle>
          <DialogDescription>
            새로운 ADB 또는 JS 명령을 등록합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="preset-name" className="text-sm text-muted-foreground mb-1 block">
              이름
            </label>
            <Input id="preset-name" placeholder="명령 프리셋 이름" className="bg-secondary" />
          </div>
          <div>
            <label htmlFor="preset-type" className="text-sm text-muted-foreground mb-1 block">
              유형
            </label>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                <Terminal className="h-3.5 w-3.5 mr-1" />
                ADB
              </Button>
              <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                <FileCode className="h-3.5 w-3.5 mr-1" />
                JS
              </Button>
            </div>
          </div>
          <div>
            <label htmlFor="preset-cmd" className="text-sm text-muted-foreground mb-1 block">
              명령어
            </label>
            <Textarea
              id="preset-cmd"
              placeholder="adb shell ..."
              className="bg-secondary font-mono text-xs h-24"
            />
          </div>
          <div>
            <label htmlFor="preset-desc" className="text-sm text-muted-foreground mb-1 block">
              설명
            </label>
            <Input id="preset-desc" placeholder="명령어에 대한 설명" className="bg-secondary" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={onClose}>등록</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PresetsPage({
  presets,
  history,
  nodes,
}: {
  presets: CommandPreset[];
  history: CommandHistory[];
  nodes: NodePC[];
}) {
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [search, setSearch] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<CommandPreset | null>(
    null,
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [executedMessage, setExecutedMessage] = useState<string | null>(null);

  const sortedPresets = useMemo(() => {
    let filtered = presets.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.command.toLowerCase().includes(search.toLowerCase()),
    );
    if (sortBy === "date") {
      filtered = filtered.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } else {
      filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));
    }
    return filtered;
  }, [presets, sortBy, search]);

  const handleDeviceConfirm = useCallback(
    (selections: { nodeId: string; deviceIds: string[] }[]) => {
      if (!selectedPreset) return;
      const parts = selections.map((s) => {
        const count = s.deviceIds.length;
        return `${s.nodeId} 노드에서 ${count}대 디바이스`;
      });
      setExecutedMessage(
        `${parts.join(", ")}에 "${selectedPreset.name}" 실행하였습니다.`,
      );
      setTimeout(() => setExecutedMessage(null), 5000);
    },
    [selectedPreset],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            명령 프리셋
          </h1>
          <p className="text-sm text-muted-foreground">
            ADB/JS 명령어를 등록하고 기기에 전송합니다.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          명령 등록
        </Button>
      </div>

      {executedMessage && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm text-emerald-400">{executedMessage}</p>
        </div>
      )}

      <Tabs defaultValue="presets">
        <TabsList className="bg-secondary">
          <TabsTrigger value="presets">명령 목록</TabsTrigger>
          <TabsTrigger value="history">실행 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="presets">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="명령 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-secondary"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortBy(sortBy === "date" ? "name" : "date")}
              className="h-8"
            >
              <ArrowUpDown className="h-3 w-3 mr-1" />
              {sortBy === "date" ? "날짜순" : "이름순"}
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="flex flex-col gap-2 pr-3">
              {sortedPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {preset.type === "adb" ? (
                          <Terminal className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <FileCode className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-foreground truncate">
                          {preset.name}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] shrink-0"
                        >
                          {preset.type.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">
                        {preset.description}
                      </p>
                      <code className="text-xs font-mono text-muted-foreground/70 block truncate">
                        {preset.command}
                      </code>
                      <div className="flex items-center gap-1 mt-1.5">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {new Date(preset.updatedAt).toLocaleDateString(
                            "ko-KR",
                          )}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => {
                        setSelectedPreset(preset);
                        setSelectorOpen(true);
                      }}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      실행
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="history">
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="flex flex-col gap-2 pr-3">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          h.status === "success" &&
                            "border-emerald-500/30 text-emerald-400",
                          h.status === "running" &&
                            "border-amber-500/30 text-amber-400",
                          h.status === "failed" &&
                            "border-red-500/30 text-red-400",
                        )}
                      >
                        {h.status === "success"
                          ? "성공"
                          : h.status === "running"
                            ? "실행 중"
                            : "실패"}
                      </Badge>
                      <span className="text-sm text-foreground">
                        {h.presetName}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(h.executedAt).toLocaleString("ko-KR")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {h.targetNode} 노드에서 {h.targetDevices}에 &quot;{h.presetName}
                    &quot; 실행하였습니다.
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <DeviceSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        nodes={nodes}
        onConfirm={handleDeviceConfirm}
      />
      <AddPresetDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
