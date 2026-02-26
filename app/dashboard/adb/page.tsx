"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Terminal,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface CmdPreset {
  label: string;
  command: string;
  category?: string;
  description?: string;
}

interface CommandLog {
  id: string;
  command?: string;
  status?: string;
  message?: string;
  device_serial?: string;
  target_type?: string;
  target_serials?: string[] | null;
  created_at?: string;
  data?: unknown;
}

interface Device {
  id: string;
  serial: string;
  status: string;
  worker_id: string | null;
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function timeSince(d: string | null | undefined): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

export default function ADBPage() {
  const [execOpen, setExecOpen] = useState(false);
  const [execPreset, setExecPreset] = useState<CmdPreset | null>(null);
  const [execDevice, setExecDevice] = useState("all");
  const [execLoading, setExecLoading] = useState(false);
  const [execResult, setExecResult] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customCmd, setCustomCmd] = useState("");

  const { data: presetsData } = useSWR<{ presets: CmdPreset[] }>(
    "/api/commands/presets",
    fetcher
  );
  const { data: logsData, mutate: mutateLogs } = useSWR<{ commands: CommandLog[] }>(
    "/api/commands?limit=20",
    fetcher,
    { refreshInterval: 10_000 }
  );
  const { data: devicesData } = useSWR<{ devices: Device[] }>(
    "/api/devices",
    fetcher
  );

  const presets = presetsData?.presets ?? [];
  const logs = (logsData?.commands ?? []).slice(0, 20);
  const devices = (devicesData?.devices ?? []).filter(
    (d) => d.status === "online" || d.status === "busy"
  );

  const openExec = (preset: CmdPreset) => {
    setExecPreset(preset);
    setExecDevice("all");
    setExecResult(null);
    setExecOpen(true);
  };

  const handleExec = async () => {
    if (!execPreset) return;
    setExecLoading(true);
    setExecResult(null);
    const command =
      execPreset.command ?? (execPreset as { config?: { command?: string } }).config?.command ?? execPreset.label;
    const body: { command: string; target_type: string; target_serials?: string[] } = {
      command,
      target_type: execDevice === "all" ? "all" : "device",
    };
    if (execDevice !== "all") body.target_serials = [execDevice];

    const res = await apiClient.post<{ command_id?: string }>("/api/commands", {
      body,
    });
    setExecLoading(false);
    if (res.success) {
      setExecResult(JSON.stringify({ command_id: res.data?.command_id }, null, 2));
      mutateLogs();
      toast.success("명령 전송됨");
    } else {
      setExecResult(JSON.stringify({ error: res.error }, null, 2));
    }
  };

  const handleCustomExec = async () => {
    if (!customCmd.trim()) return;
    setExecLoading(true);
    const body: { command: string; target_type: string; target_serials?: string[] } = {
      command: customCmd.trim(),
      target_type: execDevice === "all" ? "all" : "device",
    };
    if (execDevice !== "all") body.target_serials = [execDevice];

    const res = await apiClient.post("/api/commands", { body });
    setExecLoading(false);
    if (res.success) {
      setExecResult(JSON.stringify(res.data ?? { ok: true }, null, 2));
      setCustomOpen(false);
      setCustomCmd("");
      mutateLogs();
      toast.success("명령 전송됨");
    } else {
      setExecResult(JSON.stringify({ error: res.error }, null, 2));
    }
  };

  const isLoading = !presetsData && !logsData && !devicesData;

  if (isLoading && presets.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ADB 콘솔</h1>
          <p className="text-sm text-slate-500">
            {presets.length}개 프리셋 · {devices.length}대 온라인
          </p>
        </div>
        <Button
          onClick={() => {
            setCustomOpen(true);
            setExecResult(null);
            setExecDevice("all");
          }}
          size="sm"
          className="bg-primary hover:bg-primary/90"
        >
          <Terminal className="mr-1.5 h-3.5 w-3.5" /> 커스텀 명령
        </Button>
      </div>

      {presets.length > 0 && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            프리셋
          </span>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {presets.map((p, idx) => (
              <div
                key={p.label + idx}
                className="group rounded-xl border border-[#1e2130] bg-[#12141d] p-4 transition-colors hover:border-[#2a2d40]"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-900/20">
                      <Terminal className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">
                        {p.label}
                      </div>
                      {p.category && (
                        <span className="text-[9px] uppercase tracking-wider text-slate-500">
                          {p.category}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => openExec(p)}
                    size="sm"
                    variant="outline"
                    className="h-7 border-emerald-900/30 bg-emerald-900/10 text-[10px] text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-emerald-900/20"
                  >
                    <Play className="mr-1 h-3 w-3" /> 실행
                  </Button>
                </div>
                {p.description && (
                  <p className="line-clamp-1 text-xs text-slate-500">
                    {p.description}
                  </p>
                )}
                {(p.command || (p as { config?: { command?: string } }).config?.command) && (
                  <div className="mt-2 truncate rounded-md bg-[#0d1117] px-2.5 py-1.5 font-mono text-[10px] text-slate-400">
                    $ {p.command ?? (p as { config?: { command?: string } }).config?.command}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          실행 이력
        </span>
        <div className="mt-2 overflow-hidden rounded-xl border border-[#1e2130] bg-[#12141d]">
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-600">
              실행 이력 없음
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2130] text-[9px] uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-2.5 text-left">상태</th>
                  <th className="px-4 py-2.5 text-left">명령</th>
                  <th className="px-4 py-2.5 text-left">대상</th>
                  <th className="px-4 py-2.5 text-left">시각</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const ok =
                    l.status === "completed" || l.status === "success";
                  const target =
                    l.target_type === "all"
                      ? "전체"
                      : (l.target_serials ?? [])[0] ?? l.target_type ?? "—";
                  return (
                    <tr
                      key={l.id}
                      className="border-b border-[#1e2130]/30 hover:bg-[#1a1d2e]/20"
                    >
                      <td className="px-4 py-2">
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                      </td>
                      <td className="max-w-[150px] truncate font-mono text-slate-400">
                        {l.command ?? "—"}
                      </td>
                      <td className="font-mono text-slate-500">{target}</td>
                      <td className="text-slate-600">
                        {timeSince(l.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={execOpen} onOpenChange={setExecOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Terminal className="h-4 w-4" /> {execPreset?.label}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(execPreset?.command ?? (execPreset as { config?: { command?: string } })?.config?.command) && (
              <div className="rounded-md bg-[#0d1117] px-3 py-2 font-mono text-xs text-emerald-400">
                $ {execPreset?.command ?? (execPreset as { config?: { command?: string } })?.config?.command}
              </div>
            )}
            <div>
              <span className="text-xs text-slate-400">대상 디바이스</span>
              <Select value={execDevice} onValueChange={setExecDevice}>
                <SelectTrigger className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 ({devices.length}대)</SelectItem>
                  {devices.slice(0, 20).map((d) => (
                    <SelectItem key={d.id} value={d.serial}>
                      {d.serial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {execResult && (
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#0d1117] p-3 font-mono text-[10px] text-slate-400">
                {execResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExecOpen(false)}
              className="border-[#1e2130] text-slate-400"
            >
              닫기
            </Button>
            <Button
              onClick={handleExec}
              disabled={execLoading}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {execLoading ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">커스텀 ADB 명령</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-slate-400">대상 디바이스</span>
              <Select value={execDevice} onValueChange={setExecDevice}>
                <SelectTrigger className="mt-1 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 ({devices.length}대)</SelectItem>
                  {devices.slice(0, 20).map((d) => (
                    <SelectItem key={d.id} value={d.serial}>
                      {d.serial}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="text-xs text-slate-400">ADB Shell 명령</span>
              <Input
                value={customCmd}
                onChange={(e) => setCustomCmd(e.target.value)}
                placeholder="input tap 540 350"
                className="mt-1 border-[#1e2130] bg-[#12141d] font-mono text-sm text-emerald-400"
              />
            </div>
            {execResult && (
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#0d1117] p-3 font-mono text-[10px] text-slate-400">
                {execResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomOpen(false)}
              className="border-[#1e2130] text-slate-400"
            >
              닫기
            </Button>
            <Button
              onClick={handleCustomExec}
              disabled={execLoading || !customCmd.trim()}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {execLoading ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1.5 h-3.5 w-3.5" />
              )}
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
