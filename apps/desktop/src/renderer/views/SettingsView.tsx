import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Alert from "@mui/material/Alert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commands, isElectron } from "../src";

type SettingRow = { key: string; value: string; description: string | null; updated_at: string | null };

/** 설정 키 → (종류별 카테고리, 한국어 요약 라벨) */
const SETTING_CATEGORY_AND_LABEL: Record<string, { category: string; label: string }> = {
  heartbeat_interval: { category: "동기화", label: "허트비트 간격(ms)" },
  adb_reconnect_interval: { category: "ADB 재접속", label: "adb 재접속 대기(ms)" },
  proxy_check_interval: { category: "프록시", label: "프록시 확인 간격(ms)" },
  proxy_policy: { category: "프록시", label: "프록시 정책" },
  max_concurrent_tasks: { category: "작업", label: "최대 동시 작업 수" },
  task_execution_timeout_ms: { category: "작업", label: "작업 실행 제한 시간(ms)" },
  device_interval: { category: "기기", label: "기기 폴링 간격(ms)" },
  watch_duration: { category: "시청", label: "시청 시간 범위" },
  task_interval: { category: "작업", label: "작업 간격 범위" },
  max_retry_count: { category: "작업", label: "최대 재시도 횟수" },
  log_retention_days: { category: "로그", label: "로그 보관 일수" },
  command_log_retention_days: { category: "로그", label: "명령 로그 보관 일수" },
  primary_pc_id: { category: "PC", label: "주 PC ID" },
  task_poll_interval: { category: "동기화", label: "작업 폴링 간격(ms)" },
  auto_recover: { category: "자동복구", label: "자동복구 사용" },
  run_optimize_on_connect: { category: "기기", label: "연결 시 최적화 1회 실행" },
};

function getCategoryAndLabel(key: string): { category: string; label: string } {
  return (
    SETTING_CATEGORY_AND_LABEL[key] ?? {
      category: "기타",
      label: key,
    }
  );
}

interface SettingsViewProps {
  supabase: SupabaseClient | null;
}

export function SettingsView({ supabase }: SettingsViewProps) {
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [ready, setReady] = useState(false);
  const [appPath, setAppPath] = useState<string>("");
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [configRows, setConfigRows] = useState<SettingRow[]>([]);
  const [configDirty, setConfigDirty] = useState<Record<string, string>>({});
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaveStatus, setConfigSaveStatus] = useState<"idle" | "saving" | "ok" | "error">("idle");

  useEffect(() => {
    if (isElectron()) {
      commands.getLaunchAtLogin().then((v) => {
        setLaunchAtLogin(v);
        setReady(true);
      });
      commands.getAppPath().then(setAppPath).catch(() => {});
      commands.getAgentState().then(setAgentState).catch(() => {});
      const unsub = commands.onAgentState((s) => setAgentState(s as AgentState));
      return () => unsub();
    } else setReady(true);
  }, []);

  const fetchConfig = useCallback(async () => {
    if (!supabase) return;
    setConfigError(null);
    const { data, error } = await supabase
      .from("settings")
      .select("key, value, description, updated_at")
      .order("key");
    if (error) {
      setConfigError(error.message);
      return;
    }
    setConfigRows((data as SettingRow[]) ?? []);
    setConfigDirty({});
  }, [supabase]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleConfigValueChange = (key: string, value: string) => {
    setConfigDirty((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfigSave = async () => {
    if (!supabase || Object.keys(configDirty).length === 0) return;
    setConfigSaveStatus("saving");
    setConfigError(null);
    for (const [key, value] of Object.entries(configDirty)) {
      const { error } = await supabase.from("settings").update({ value }).eq("key", key);
      if (error) {
        setConfigError(error.message);
        setConfigSaveStatus("error");
        return;
      }
    }
    setConfigDirty({});
    setConfigSaveStatus("ok");
    await fetchConfig();
    setTimeout(() => setConfigSaveStatus("idle"), 2000);
  };

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.checked;
    setLaunchAtLogin(v);
    commands.setLaunchAtLogin(v);
  };

  const byCategory = configRows.reduce<Record<string, SettingRow[]>>((acc, row) => {
    const { category } = getCategoryAndLabel(row.key);
    if (!acc[category]) acc[category] = [];
    acc[category].push(row);
    return acc;
  }, {});
  const categoryOrder = ["동기화", "ADB 재접속", "자동복구", "프록시", "작업", "기기", "시청", "로그", "PC", "기타"];

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>
        설정
      </Typography>
      {ready && isElectron() && (
        <FormControlLabel
          control={<Switch checked={launchAtLogin} onChange={handleToggle} />}
          label="시작 시 자동 실행"
        />
      )}

      {supabase && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            전역 설정 (Supabase)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Supabase에 저장된 설정입니다. 수정 후 저장하면 모든 클라이언트(Agent)에 Realtime으로 전달됩니다.
          </Typography>
          {configError && (
            <Alert severity="error" sx={{ mb: 1 }} onClose={() => setConfigError(null)}>
              {configError}
            </Alert>
          )}
          {categoryOrder.filter((c) => byCategory[c]?.length).map((category) => (
            <Box key={category} sx={{ mb: 2 }}>
              <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600, mb: 1 }}>
                {category}
              </Typography>
              <Table size="small" sx={{ maxWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>항목</TableCell>
                    <TableCell>값</TableCell>
                    <TableCell>비고</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {byCategory[category].map((row) => {
                    const { label } = getCategoryAndLabel(row.key);
                    const dirtyVal = configDirty[row.key];
                    const displayVal = dirtyVal !== undefined ? dirtyVal : row.value;
                    return (
                      <TableRow key={row.key}>
                        <TableCell sx={{ fontSize: "0.9rem" }}>{label}</TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            fullWidth
                            value={displayVal}
                            onChange={(e) => handleConfigValueChange(row.key, e.target.value)}
                            sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                          />
                        </TableCell>
                        <TableCell sx={{ color: "text.secondary", fontSize: "0.8rem" }}>
                          {row.description ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          ))}
          {configRows.length === 0 && !configError && (
            <Typography variant="body2" color="text.secondary">
              설정이 없거나 Supabase 권한이 없습니다.
            </Typography>
          )}
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              disabled={Object.keys(configDirty).length === 0 || configSaveStatus === "saving"}
              onClick={handleConfigSave}
            >
              {configSaveStatus === "saving" ? "저장 중…" : "Supabase에 저장"}
            </Button>
            {configSaveStatus === "ok" && (
              <Typography variant="body2" color="success.main">
                저장됨. Agent가 Realtime으로 반영합니다.
              </Typography>
            )}
          </Box>
        </Box>
      )}

      <Alert severity="info" sx={{ mt: 3 }}>
        Agent 설정 및 채널·내용 등록은 Supabase 대시보드 또는 명령으로만 가능합니다. 이 화면에서는 수정할 수 없습니다.
      </Alert>

      {isElectron() && agentState != null && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            WebSocket URL (실제 사용)
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
            {agentState.wsEffectiveUrl ?? "—"}
          </Typography>
          {agentState.wsAttemptNo != null && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              시도 #{agentState.wsAttemptNo}
            </Typography>
          )}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
            WebSocket 상태
          </Typography>
          <Chip
            label={agentState.wsStatus ?? "—"}
            size="small"
            color={
              agentState.wsStatus === "CONNECTED"
                ? "success"
                : agentState.wsStatus === "FAILED"
                  ? "error"
                  : "default"
            }
            sx={{ mt: 0.5 }}
          />
          {agentState.wsFailureCategory && agentState.wsStatus === "FAILED" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {agentState.wsFailureCategory === "TCP_REFUSED"
                ? "TCP 거부 (서버 미실행/포트)"
                : agentState.wsFailureCategory === "HTTP_4XX"
                  ? "HTTP 400/404 (경로/핸드셰이크)"
                  : agentState.wsFailureCategory === "TIMEOUT"
                    ? "타임아웃 (이벤트/응답 지연)"
                    : "기타"}
            </Typography>
          )}
          {agentState.wsLastFailure && (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                마지막 WebSocket 오류
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
                {agentState.wsLastFailure}
              </Typography>
            </>
          )}
        </Box>
      )}
      {appPath && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary">
            정보 — 실행 파일 경로
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: "monospace", wordBreak: "break-all" }}>
            {appPath}
          </Typography>
        </Box>
      )}
      {!isElectron() && (
        <Typography color="text.secondary">Electron API를 사용할 수 없습니다(예: 브라우저).</Typography>
      )}
    </Box>
  );
}
