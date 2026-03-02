import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TranslateIcon from "@mui/icons-material/Translate";
import KeyboardIcon from "@mui/icons-material/Keyboard";
import StayCurrentPortraitIcon from "@mui/icons-material/StayCurrentPortrait";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import DevicesIcon from "@mui/icons-material/Devices";
import TuneIcon from "@mui/icons-material/Tune";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import SaveIcon from "@mui/icons-material/Save";
import { useDeviceStore } from "../store/useDeviceStore";
import { usePresetStore } from "../store/usePresetStore";
import { useAlertStore } from "../store/useAlertStore";

const STATE_COLOR: Record<Device["state"], string> = {
  device: "#28C76F",
  unauthorized: "#FF9F43",
  offline: "#EA5455",
  no_device: "#9E9E9E",
};

const PRESETS: Array<{ id: PresetId; label: string; icon: React.ReactNode }> = [
  { id: 1, label: "언어 → 한국어", icon: <TranslateIcon fontSize="small" /> },
  { id: 2, label: "키보드 (한국어 IME)", icon: <KeyboardIcon fontSize="small" /> },
  { id: 3, label: "화면 세로 고정", icon: <StayCurrentPortraitIcon fontSize="small" /> },
  { id: 4, label: "CMAS 비활성화", icon: <NotificationsOffIcon fontSize="small" /> },
  { id: 5, label: "시리얼/IP 업데이트", icon: <DevicesIcon fontSize="small" /> },
  { id: 6, label: "최적화", icon: <TuneIcon fontSize="small" /> },
  { id: 7, label: "스크린샷", icon: <PhotoCameraIcon fontSize="small" /> },
];

type ButtonState = "idle" | "running" | "success" | "fail";

export function WorkPanel() {
  const devices = useDeviceStore((s) => s.devices);
  const { imeId, setImeId, setLastResult, screenshotPath } = usePresetStore();
  const addAlert = useAlertStore((s) => s.addAlert);

  const [selectedDevices, setSelectedDevices] = useState<Device[]>([]);
  const [imeIdInput, setImeIdInput] = useState(imeId);
  const [presetStates, setPresetStates] = useState<Record<number, ButtonState>>({});

  // Load persisted settings on mount
  useEffect(() => {
    window.electronAPI?.getSettings().then((s) => {
      if (s.imeId) setImeIdInput(s.imeId);
      if (s.imeId) setImeId(s.imeId);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isAnyRunning = Object.values(presetStates).some((s) => s === "running");

  const handlePreset = async (presetId: PresetId) => {
    if (selectedDevices.length === 0) return;
    setPresetStates((s) => ({ ...s, [presetId]: "running" }));

    try {
      const { results } = await window.electronAPI!.executePreset({
        serial: selectedDevices.map((d) => d.serial),
        presetId,
        options: presetId === 2 ? { imeId } : undefined,
      });

      results.forEach((r) => setLastResult(r));
      const allSuccess = results.every((r) => r.overallSuccess);
      const state: ButtonState = allSuccess ? "success" : "fail";
      setPresetStates((s) => ({ ...s, [presetId]: state }));

      // Add alert for failures
      results
        .filter((r) => !r.overallSuccess)
        .forEach((r) => {
          addAlert({
            id: `${Date.now()}-${r.serial}`,
            timestamp: Date.now(),
            severity: "ERROR",
            serial: r.serial,
            type: "CMD_FAILED",
            message: `Preset ${r.presetId} failed on ${r.serial}`,
          });
        });
    } catch {
      setPresetStates((s) => ({ ...s, [presetId]: "fail" }));
    } finally {
      setTimeout(
        () =>
          setPresetStates((s) => {
            const { [presetId]: _, ...rest } = s;
            return rest;
          }),
        3000
      );
    }
  };

  const handleSaveImeId = () => {
    setImeId(imeIdInput);
    window.electronAPI?.setSettings({ imeId: imeIdInput });
  };

  const getButtonIcon = (presetId: PresetId, defaultIcon: React.ReactNode) => {
    const state = presetStates[presetId] ?? "idle";
    if (state === "running") return <CircularProgress size={16} color="inherit" />;
    if (state === "success") return <CheckIcon fontSize="small" />;
    if (state === "fail") return <CloseIcon fontSize="small" />;
    return defaultIcon;
  };

  const getButtonColor = (presetId: PresetId): "primary" | "success" | "error" => {
    const state = presetStates[presetId] ?? "idle";
    if (state === "success") return "success";
    if (state === "fail") return "error";
    return "primary";
  };

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        Device Selection
      </Typography>

      <Autocomplete
        multiple
        options={devices}
        value={selectedDevices}
        onChange={(_, v) => setSelectedDevices(v)}
        getOptionLabel={(d) => d.serial}
        renderOption={(props, d) => (
          <li {...props}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: STATE_COLOR[d.state] }} />
              <Typography variant="body2">{d.serial}</Typography>
              {d.model && (
                <Typography variant="caption" color="text.secondary">
                  {d.model}
                </Typography>
              )}
            </Box>
          </li>
        )}
        renderTags={(value, getTagProps) =>
          value.map((d, i) => {
            const { key, ...tagProps } = getTagProps({ index: i });
            return (
              <Chip
                key={key}
                label={d.serial}
                size="small"
                sx={{ bgcolor: STATE_COLOR[d.state], color: "#fff" }}
                {...tagProps}
              />
            );
          })
        }
        renderInput={(params) => (
          <TextField {...params} size="small" placeholder="Select devices…" label="Devices" />
        )}
        size="small"
      />

      {selectedDevices.length > 0 && (
        <Box sx={{ mt: 1, pl: 0.5 }}>
          {selectedDevices.slice(0, 3).map((d) => (
            <Typography key={d.serial} variant="caption" color="text.secondary" display="block">
              {d.serial}
              {d.ip ? ` · ${d.ip}` : ""}
              {d.model ? ` · ${d.model}` : ""}
              {d.sdkVersion ? ` · SDK ${d.sdkVersion}` : ""}
            </Typography>
          ))}
          {selectedDevices.length > 3 && (
            <Typography variant="caption" color="text.secondary">
              +{selectedDevices.length - 3} more
            </Typography>
          )}
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Presets
      </Typography>

      <Stack spacing={0.5}>
        {PRESETS.map(({ id, label, icon }) => (
          <Button
            key={id}
            variant="outlined"
            size="small"
            color={getButtonColor(id)}
            disabled={isAnyRunning || selectedDevices.length === 0}
            onClick={() => handlePreset(id)}
            startIcon={getButtonIcon(id, icon)}
            sx={{ justifyContent: "flex-start", textAlign: "left" }}
            fullWidth
          >
            {label}
          </Button>
        ))}
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        IME ID (Preset 2)
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          size="small"
          value={imeIdInput}
          onChange={(e) => setImeIdInput(e.target.value)}
          fullWidth
          placeholder="com.example.ime/.ImeService"
        />
        <Button
          size="small"
          variant="contained"
          onClick={handleSaveImeId}
          disabled={imeIdInput === imeId}
          sx={{ minWidth: 40, px: 1 }}
        >
          <SaveIcon fontSize="small" />
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        Screenshot path: {screenshotPath}
      </Typography>
    </Paper>
  );
}
