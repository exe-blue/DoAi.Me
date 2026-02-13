"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Terminal,
  Play,
  RotateCcw,
  Copy,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { DeviceRow, CommandLogRow } from "@/lib/supabase/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface CommandPreset {
  label: string;
  command: string;
  category: string;
  description: string;
  dangerous?: boolean;
}

interface CommandResult {
  device_serial: string;
  success: boolean;
  output?: string;
  error?: string;
  duration_ms?: number;
}

export default function AdbConsolePage() {
  const [command, setCommand] = useState("");
  const [targetMode, setTargetMode] = useState<"all" | "select">("all");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [deviceSearch, setDeviceSearch] = useState("");
  const [presets, setPresets] = useState<CommandPreset[]>([]);

  const [executing, setExecuting] = useState(false);
  const [currentCommandId, setCurrentCommandId] = useState<string | null>(null);
  const [results, setResults] = useState<CommandResult[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<CommandLogRow[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; command: string; count: number }>({
    open: false,
    command: "",
    count: 0,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices();
  }, []);

  // Fetch presets on mount
  useEffect(() => {
    fetchPresets();
  }, []);

  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  async function fetchDevices() {
    try {
      const res = await fetch("/api/devices");
      if (!res.ok) return;
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch (error) {
      console.error("Failed to fetch devices:", error);
    }
  }

  async function fetchPresets() {
    try {
      const res = await fetch("/api/commands/presets");
      if (!res.ok) return;
      const data = await res.json();
      setPresets(data.presets ?? []);
    } catch (error) {
      console.error("Failed to fetch presets:", error);
    }
  }

  async function fetchHistory() {
    try {
      const res = await fetch("/api/commands?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.commands ?? []);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  }

  async function executeCommand() {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return;

    // Check for blocked commands
    const BLOCKED = [/rm\s+-rf/i, /format\s+/i, /factory[_\s]?reset/i, /wipe\s+/i, /flash\s+/i, /dd\s+if=/i];
    if (BLOCKED.some((p) => p.test(trimmedCommand))) {
      alert("차단된 명령어입니다");
      return;
    }

    // Check for reboot command
    if (/\breboot\b/i.test(trimmedCommand)) {
      const targetCount = targetMode === "all" ? devices.length : selectedDevices.size;
      setConfirmDialog({ open: true, command: trimmedCommand, count: targetCount });
      return;
    }

    await runCommand(trimmedCommand);
  }

  async function runCommand(cmd: string) {
    const targetSerials = targetMode === "select" ? Array.from(selectedDevices) : null;
    const targetCount = targetSerials ? targetSerials.length : devices.length;

    if (targetCount === 0) return;

    setExecuting(true);
    setResults([]);
    setProgress({ completed: 0, total: targetCount });

    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: cmd,
          target_type: targetMode === "all" ? "all" : "select",
          target_serials: targetSerials,
        }),
      });

      if (!res.ok) throw new Error("Failed to execute command");
      const { command_id } = await res.json();
      setCurrentCommandId(command_id);

      // Subscribe to progress
      const supabase = createClient();
      if (!supabase) {
        console.warn("Supabase client not available");
        setExecuting(false);
        return;
      }

      const channel = supabase
        .channel(`room:command:${command_id}`)
        .on("broadcast", { event: "progress" }, ({ payload }) => {
          const data = payload as CommandResult;
          setResults((prev) => [...prev, data]);
          setProgress((prev) => ({ ...prev, completed: prev.completed + 1 }));
        })
        .on("broadcast", { event: "complete" }, () => {
          setExecuting(false);
          fetchHistory();
        })
        .subscribe();

      channelRef.current = channel;
    } catch (error) {
      console.error("Command execution failed:", error);
      setExecuting(false);
    }
  }

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        const supabase = createClient();
        if (supabase) {
          supabase.removeChannel(channelRef.current);
        }
      }
    };
  }, []);

  const filteredDevices = useMemo(() => {
    if (!deviceSearch) return devices;
    const lower = deviceSearch.toLowerCase();
    return devices.filter(
      (d) =>
        d.serial.toLowerCase().includes(lower) ||
        d.nickname?.toLowerCase().includes(lower)
    );
  }, [devices, deviceSearch]);

  const onlineDevices = devices.filter((d) => d.status === "online");

  function toggleDevice(serial: string) {
    setSelectedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
      } else {
        next.add(serial);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedDevices(new Set(filteredDevices.map((d) => d.serial)));
  }

  function deselectAll() {
    setSelectedDevices(new Set());
  }

  function copyResults() {
    const text = results
      .map((r) => `[${r.device_serial}] ${r.success ? r.output : r.error}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  }

  function rerunCommand(cmd: CommandLogRow) {
    setCommand(cmd.command);
    if (cmd.target_type === "select" && cmd.target_serials) {
      setTargetMode("select");
      setSelectedDevices(new Set(cmd.target_serials as string[]));
    } else {
      setTargetMode("all");
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const avgDuration =
    results.length > 0
      ? (results.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / results.length / 1000).toFixed(1)
      : "0";

  const presetsByCategory = useMemo(() => {
    const grouped: Record<string, CommandPreset[]> = {};
    for (const preset of presets) {
      if (!grouped[preset.category]) grouped[preset.category] = [];
      grouped[preset.category].push(preset);
    }
    return grouped;
  }, [presets]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">ADB 콘솔</h1>
        <p className="text-base text-muted-foreground">
          실시간 ADB 명령을 실행합니다.
        </p>
      </div>

      {/* Zone A: Command Input */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-muted-foreground" />
            <CardTitle>명령 입력</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Command Input */}
          <div className="space-y-2">
            <Label>명령어</Label>
            <div className="flex items-center gap-2">
              <Input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="adb shell 명령어를 입력하세요..."
                className="flex-1 font-mono"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !executing) {
                    executeCommand();
                  }
                }}
              />
              <Button
                onClick={executeCommand}
                disabled={!command.trim() || executing}
                className="gap-1.5"
              >
                <Play className="h-4 w-4" />
                실행
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCommand("");
                  setResults([]);
                }}
                disabled={executing}
              >
                <RotateCcw className="h-4 w-4" />
                초기화
              </Button>
            </div>
          </div>

          {/* Target Selector */}
          <div className="space-y-2">
            <Label>대상 선택</Label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={targetMode === "all"}
                  onChange={() => setTargetMode("all")}
                  className="cursor-pointer"
                />
                <span className="text-sm">전체 디바이스 ({onlineDevices.length}개)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={targetMode === "select"}
                  onChange={() => setTargetMode("select")}
                  className="cursor-pointer"
                />
                <span className="text-sm">디바이스 선택 ({selectedDevices.size}개)</span>
              </label>
            </div>
          </div>

          {/* Device Checklist */}
          {targetMode === "select" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Input
                  value={deviceSearch}
                  onChange={(e) => setDeviceSearch(e.target.value)}
                  placeholder="디바이스 검색..."
                  className="w-64 h-8 text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    전체 선택
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAll}>
                    전체 해제
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-48 border rounded-md p-2">
                <div className="space-y-1.5">
                  {filteredDevices.map((device) => (
                    <label
                      key={device.serial}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedDevices.has(device.serial)}
                        onCheckedChange={() => toggleDevice(device.serial)}
                      />
                      <span className="text-sm font-mono">
                        {device.nickname || device.serial}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-auto text-xs",
                          device.status === "online"
                            ? "border-green-500/30 text-green-500"
                            : "border-gray-500/30 text-gray-500"
                        )}
                      >
                        {device.status}
                      </Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Preset Buttons */}
          <div className="space-y-2">
            <Label>프리셋 명령</Label>
            <div className="space-y-2">
              {Object.entries(presetsByCategory).map(([category, items]) => (
                <div key={category}>
                  <p className="text-xs text-muted-foreground mb-1 capitalize">{category}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((preset) => (
                      <Button
                        key={preset.command}
                        variant="outline"
                        size="sm"
                        onClick={() => setCommand(preset.command)}
                        className={cn(
                          "text-xs",
                          preset.dangerous && "border-red-500/30 text-red-500"
                        )}
                        title={preset.description}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone B: Live Output */}
      <Card className="flex-1 min-h-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>실행 결과</CardTitle>
            {results.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyResults} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" />
                결과 복사
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="h-full overflow-hidden">
          {!executing && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Terminal className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">명령어를 입력하고 실행하세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Progress */}
              {executing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      {progress.total}개 디바이스에서 실행 중... {progress.completed}/{progress.total} 완료
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round((progress.completed / progress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Results List */}
              <ScrollArea className="h-[calc(100vh-600px)]" ref={scrollRef}>
                <div className="space-y-1.5 font-mono text-xs">
                  {results.map((result, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "p-2 rounded border",
                        result.success
                          ? "border-green-500/30 bg-green-500/5"
                          : "border-red-500/30 bg-red-500/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-muted-foreground">
                          [{result.device_serial.slice(0, 8)}]
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            result.success
                              ? "border-green-500/30 text-green-500"
                              : "border-red-500/30 text-red-500"
                          )}
                        >
                          {result.success ? "SUCCESS" : "ERROR"}
                        </Badge>
                        {result.duration_ms && (
                          <span className="text-muted-foreground text-[10px]">
                            {(result.duration_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      <pre className={cn("whitespace-pre-wrap break-all", result.success ? "" : "text-red-500")}>
                        {result.success ? result.output : result.error}
                      </pre>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Summary */}
              {!executing && results.length > 0 && (
                <div className="flex items-center gap-3 text-sm border-t pt-3">
                  <span className="text-green-500">✓ {successCount} 성공</span>
                  <span className="text-red-500">✗ {failCount} 실패</span>
                  <span className="text-muted-foreground">평균 {avgDuration}초</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Zone C: Command History */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 w-full text-left hover:opacity-80"
          >
            {showHistory ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <CardTitle>명령 기록</CardTitle>
            <Badge variant="outline" className="ml-2">
              {history.length}
            </Badge>
          </button>
        </CardHeader>
        {showHistory && (
          <CardContent>
            <div className="space-y-2">
              {history.map((cmd) => (
                <div
                  key={cmd.id}
                  className="border rounded-md p-3 space-y-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {cmd.created_at ? new Date(cmd.created_at).toLocaleString("ko-KR") : "날짜 없음"}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0",
                            cmd.status === "completed"
                              ? "border-green-500/30 text-green-500"
                              : cmd.status === "failed"
                                ? "border-red-500/30 text-red-500"
                                : "border-yellow-500/30 text-yellow-500"
                          )}
                        >
                          {cmd.status}
                        </Badge>
                      </div>
                      <code className="text-sm font-mono block">
                        {cmd.command.length > 50 ? `${cmd.command.slice(0, 50)}...` : cmd.command}
                      </code>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>대상: {cmd.target_type === "all" ? "전체" : `선택 ${(cmd.target_serials as string[] | null)?.length ?? 0}개`}</span>
                        {cmd.results && (
                          <>
                            <span>✓ {(cmd.results as any).success ?? 0}</span>
                            <span>✗ {(cmd.results as any).failed ?? 0}</span>
                          </>
                        )}
                        {cmd.completed_at && cmd.created_at && (
                          <span>
                            {((new Date(cmd.completed_at).getTime() - new Date(cmd.created_at).getTime()) / 1000).toFixed(1)}초
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => rerunCommand(cmd)}
                      className="gap-1.5"
                    >
                      <Play className="h-3 w-3" />
                      재실행
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Reboot Confirmation Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              재부팅 확인
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.count}개 디바이스를 재부팅합니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, command: "", count: 0 })}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                runCommand(confirmDialog.command);
                setConfirmDialog({ open: false, command: "", count: 0 });
              }}
            >
              재부팅
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
