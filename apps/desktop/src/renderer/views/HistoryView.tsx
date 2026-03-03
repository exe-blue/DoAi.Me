import React, { useEffect, useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import type { SupabaseClient } from "@supabase/supabase-js";

type TaskDeviceRow = {
  id: string;
  task_id: string;
  device_serial: string;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error: string | null;
  result: unknown;
  retry_count: number | null;
  xiaowei_action: string | null;
  xiaowei_code: number | null;
  created_at: string | null;
};

type TaskLogRow = {
  id: string;
  task_device_id: string | null;
  action: string | null;
  level: string | null;
  message: string | null;
  request: unknown;
  response: unknown;
  source: string | null;
  created_at: string | null;
};

interface HistoryViewProps {
  supabase: SupabaseClient | null;
}

export function HistoryView({ supabase }: HistoryViewProps) {
  const [taskDevices, setTaskDevices] = useState<TaskDeviceRow[]>([]);
  const [taskLogsByDeviceId, setTaskLogsByDeviceId] = useState<Record<string, TaskLogRow[]>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("task_devices")
      .select("id, task_id, device_serial, status, started_at, completed_at, duration_ms, error, result, retry_count, xiaowei_action, xiaowei_code, created_at")
      .order("completed_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => setTaskDevices((data as TaskDeviceRow[]) ?? []));
  }, [supabase]);

  const ids = useMemo(() => taskDevices.map((d) => d.id), [taskDevices]);

  useEffect(() => {
    if (!supabase || ids.length === 0) return;
    supabase
      .from("task_logs")
      .select("id, task_device_id, action, level, message, request, response, source, created_at")
      .in("task_device_id", ids)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const logs = (data as TaskLogRow[]) ?? [];
        const byId: Record<string, TaskLogRow[]> = {};
        for (const log of logs) {
          const tid = log.task_device_id ?? "";
          if (!byId[tid]) byId[tid] = [];
          byId[tid].push(log);
        }
        setTaskLogsByDeviceId(byId);
      });
  }, [supabase, ids.join(",")]);

  const formatDt = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "medium" }) : "—");
  const formatMs = (ms: number | null) => (ms != null ? `${(ms / 1000).toFixed(1)}s` : "—");

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        히스토리
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        task_device 이벤트를 명명 규칙에 따라 정리했습니다. 기기 완료 순서(최신 완료가 위). 행에 마우스를 올리면 아래에 상세 이벤트가 표시됩니다.
      </Typography>
      <Paper sx={{ overflow: "auto" }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>순번</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>기기</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>상태</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>작업 ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>모듈/액션</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>시작 시각</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>완료 시각</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>소요</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>에러</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {taskDevices.map((row, index) => {
              const isHovered = hoveredId === row.id;
              const logs = taskLogsByDeviceId[row.id] ?? [];
              return (
                <React.Fragment key={row.id}>
                  <TableRow
                    key={row.id}
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    sx={{
                      bgcolor: isHovered ? "action.hover" : undefined,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <TableCell>{index + 1}</TableCell>
                    <TableCell sx={{ fontFamily: "monospace" }}>{row.device_serial}</TableCell>
                    <TableCell>
                      <Chip
                        label={row.status ?? "—"}
                        size="small"
                        color={row.status === "completed" ? "success" : row.status === "failed" ? "error" : "default"}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontSize: 11 }} title={row.task_id}>
                      {row.task_id.slice(0, 8)}…
                    </TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{row.xiaowei_action ?? "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>{formatDt(row.started_at)}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap", fontSize: 11 }}>{formatDt(row.completed_at)}</TableCell>
                    <TableCell>{formatMs(row.duration_ms)}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }} title={row.error ?? ""}>
                      {row.error ?? "—"}
                    </TableCell>
                  </TableRow>
                  {isHovered && (
                    <TableRow>
                      <TableCell colSpan={9} sx={{ py: 2, bgcolor: "grey.50", borderTop: 0, borderBottom: 1 }}>
                        <Typography variant="subtitle2" color="primary" sx={{ mb: 1 }}>
                          상세 이벤트 · 시작: {formatDt(row.started_at)} · 완료: {formatDt(row.completed_at)} · 소요: {formatMs(row.duration_ms)}
                        </Typography>
                        {row.error && (
                          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
                            에러: {row.error}
                          </Typography>
                        )}
                        {row.result != null && (
                          <Typography variant="caption" component="pre" sx={{ display: "block", mb: 1, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                            result: {JSON.stringify(row.result, null, 2)}
                          </Typography>
                        )}
                        <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                          단위별 이벤트 (task_logs)
                        </Typography>
                        {logs.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            이벤트 없음
                          </Typography>
                        ) : (
                          <Box component="table" sx={{ width: "100%", fontSize: 11, "& td": { py: 0.25, pr: 1 }, "& th": { textAlign: "left", pr: 1 } }}>
                            <thead>
                              <tr>
                                <th>시각</th>
                                <th>액션</th>
                                <th>레벨</th>
                                <th>메시지</th>
                              </tr>
                            </thead>
                            <tbody>
                              {logs.map((log) => (
                                <tr key={log.id}>
                                  <td style={{ whiteSpace: "nowrap" }}>{formatDt(log.created_at)}</td>
                                  <td>{log.action ?? "—"}</td>
                                  <td>{log.level ?? "—"}</td>
                                  <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis" }} title={log.message ?? ""}>
                                    {log.message ?? "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
        {taskDevices.length === 0 && (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <Typography color="text.secondary">task_device 이벤트가 없습니다.</Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
}
