"use client";

import { useState } from "react";
import { useListApi } from "@/hooks/use-api";
import { buildQuery } from "@/lib/build-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

type CommandLog = {
  id: string;
  command: string;
  target_type: string;
  target_serials: string[] | null;
  status: string;
  created_at: string | null;
  completed_at: string | null;
};

export function AdbContent() {
  const [command, setCommand] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [targetSerials, setTargetSerials] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const url = "/api/commands" + buildQuery({ page, pageSize: 20 });
  const { list: commands, error, isLoading, mutate } = useListApi<CommandLog>(url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const trimmed = command.trim();
    if (!trimmed) {
      setSubmitError("명령을 입력하세요.");
      return;
    }

    const body: { command: string; target_type?: string; target_serials?: string[] } = {
      command: trimmed,
      target_type: targetType,
    };
    if (targetType === "devices" && targetSerials.trim()) {
      body.target_serials = targetSerials.trim().split(/[\s,]+/).filter(Boolean);
    }

    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError((json as { message?: string }).message ?? "실행 실패");
        return;
      }
      if ((json as { ok?: boolean }).ok && (json as { data?: unknown }).data) {
        setCommand("");
        mutate();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "요청 실패");
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        <div className="space-y-2">
          <Label htmlFor="command">ADB 명령</Label>
          <Textarea
            id="command"
            placeholder="adb shell ..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            rows={3}
            className="font-mono text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>대상</Label>
            <Select value={targetType} onValueChange={setTargetType}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="devices">지정 시리얼</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetType === "devices" && (
            <div className="space-y-2">
              <Label htmlFor="serials">시리얼 (쉼표/공백 구분)</Label>
              <Input
                id="serials"
                placeholder="serial1, serial2"
                value={targetSerials}
                onChange={(e) => setTargetSerials(e.target.value)}
                className="w-48"
              />
            </div>
          )}
          <Button type="submit">실행</Button>
        </div>
        {submitError && (
          <p className="text-sm text-destructive">{submitError}</p>
        )}
      </form>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">실행 이력</h3>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            새로고침
          </Button>
        </div>
        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">로딩 중…</p>
        ) : (
          <ScrollArea className="h-[320px] rounded-md border p-3">
            <ul className="space-y-2">
              {commands.length === 0 ? (
                <li className="text-sm text-muted-foreground">이력 없음</li>
              ) : (
                commands.map((log) => (
                  <li key={log.id} className="flex flex-wrap gap-2 items-center text-sm border-b pb-2">
                    <span className="font-mono text-muted-foreground shrink-0">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}
                    </span>
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded break-all">
                      {log.command}
                    </span>
                    <span className="text-muted-foreground">({log.target_type})</span>
                    <span className="text-muted-foreground">{log.status}</span>
                  </li>
                ))
              )}
            </ul>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
