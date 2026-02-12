import type {
  NodePC,
  Device,
  CommandPreset,
  CommandHistory,
  Task,
  Channel,
  Content,
  LogEntry,
  DeviceStatus,
} from "./types";

// Seeded PRNG to avoid SSR/client hydration mismatch
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateDevices(nodeId: string, count: number): Device[] {
  const statuses: DeviceStatus[] = ["online", "running", "offline", "error"];
  const tasks = [
    "영상 재생 중...",
    "채널 동기화 중...",
    "데이터 수집 중...",
    null,
    null,
  ];

  const seed = nodeId.split("").reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 0);
  const random = createSeededRandom(Math.abs(seed) || 1);

  return Array.from({ length: count }, (_, i) => {
    const status = statuses[Math.floor(random() * 100) % 4];
    const hasTask = status === "running" || status === "online";
    return {
      id: `${nodeId}-D${String(i + 1).padStart(3, "0")}`,
      serial: `SN${nodeId.replace("PC-", "")}${String(i + 1).padStart(3, "0")}`,
      ip: `192.168.${parseInt(nodeId.replace("PC-", ""))}.${i + 10}`,
      status,
      currentTask: hasTask
        ? tasks[Math.floor(random() * tasks.length)]
        : null,
      nodeId,
    };
  });
}

export const mockNodes: NodePC[] = [
  {
    id: "PC-01",
    name: "Node Alpha",
    ip: "10.0.1.1",
    status: "connected",
    devices: generateDevices("PC-01", 100),
  },
  {
    id: "PC-02",
    name: "Node Beta",
    ip: "10.0.1.2",
    status: "connected",
    devices: generateDevices("PC-02", 100),
  },
  {
    id: "PC-03",
    name: "Node Gamma",
    ip: "10.0.1.3",
    status: "connected",
    devices: generateDevices("PC-03", 100),
  },
  {
    id: "PC-04",
    name: "Node Delta",
    ip: "10.0.1.4",
    status: "connected",
    devices: generateDevices("PC-04", 100),
  },
  {
    id: "PC-05",
    name: "Node Epsilon",
    ip: "10.0.1.5",
    status: "disconnected",
    devices: generateDevices("PC-05", 100),
  },
];

export const mockPresets: CommandPreset[] = [
  {
    id: "cmd-001",
    name: "YouTube 앱 실행",
    type: "adb",
    command: "adb shell am start -n com.google.android.youtube/.HomeActivity",
    description: "YouTube 앱을 실행합니다",
    createdAt: "2026-02-10T09:00:00Z",
    updatedAt: "2026-02-10T09:00:00Z",
  },
  {
    id: "cmd-002",
    name: "스크린샷 캡처",
    type: "adb",
    command: "adb shell screencap -p /sdcard/screenshot.png",
    description: "현재 화면을 캡처하여 저장합니다",
    createdAt: "2026-02-09T14:30:00Z",
    updatedAt: "2026-02-11T08:00:00Z",
  },
  {
    id: "cmd-003",
    name: "자동 로그인 스크립트",
    type: "js",
    command: "node scripts/auto-login.js --target=${deviceId}",
    description: "접근성 API를 이용한 자동 로그인",
    createdAt: "2026-02-08T16:00:00Z",
    updatedAt: "2026-02-12T10:00:00Z",
  },
  {
    id: "cmd-004",
    name: "영상 재생 자동화",
    type: "js",
    command: "node scripts/play-video.js --videoId=${videoId}",
    description: "특정 영상을 자동으로 재생합니다",
    createdAt: "2026-02-07T11:00:00Z",
    updatedAt: "2026-02-11T15:00:00Z",
  },
  {
    id: "cmd-005",
    name: "네트워크 상태 확인",
    type: "adb",
    command: "adb shell ping -c 3 8.8.8.8",
    description: "디바이스 네트워크 연결 상태를 확인합니다",
    createdAt: "2026-02-06T09:00:00Z",
    updatedAt: "2026-02-06T09:00:00Z",
  },
  {
    id: "cmd-006",
    name: "앱 캐시 초기화",
    type: "adb",
    command: "adb shell pm clear com.google.android.youtube",
    description: "YouTube 앱의 캐시를 초기화합니다",
    createdAt: "2026-02-05T13:00:00Z",
    updatedAt: "2026-02-10T07:00:00Z",
  },
];

export const mockCommandHistory: CommandHistory[] = [
  {
    id: "ch-001",
    presetId: "cmd-001",
    presetName: "YouTube 앱 실행",
    targetNode: "PC-01",
    targetDevices: "1~20 디바이스",
    executedAt: "2026-02-12T10:30:00Z",
    status: "success",
  },
  {
    id: "ch-002",
    presetId: "cmd-003",
    presetName: "자동 로그인 스크립트",
    targetNode: "PC-02",
    targetDevices: "1~20 디바이스",
    executedAt: "2026-02-12T10:25:00Z",
    status: "running",
  },
  {
    id: "ch-003",
    presetId: "cmd-002",
    presetName: "스크린샷 캡처",
    targetNode: "PC-01, PC-03",
    targetDevices: "전체 기기",
    executedAt: "2026-02-12T09:45:00Z",
    status: "success",
  },
  {
    id: "ch-004",
    presetId: "cmd-005",
    presetName: "네트워크 상태 확인",
    targetNode: "PC-05",
    targetDevices: "1~10 디바이스",
    executedAt: "2026-02-12T08:00:00Z",
    status: "failed",
  },
];

export const mockTasks: Task[] = [];

export const mockChannels: Channel[] = [
  {
    id: "ch-yt-001",
    name: "슈퍼개미 안치현",
    youtubeId: "UCxxxxxxxxxxxxxxxxxxxxxx1",
    youtubeHandle: "@SUPERANT_AN",
    thumbnail: "/placeholder-channel.jpg",
    subscriberCount: "-",
    videoCount: 0,
    addedAt: new Date().toISOString(),
    autoSync: true,
  },
  {
    id: "ch-yt-002",
    name: "감동주식TV",
    youtubeId: "UCxxxxxxxxxxxxxxxxxxxxxx2",
    youtubeHandle: "@gamdongstockTV",
    thumbnail: "/placeholder-channel.jpg",
    subscriberCount: "-",
    videoCount: 0,
    addedAt: new Date().toISOString(),
    autoSync: true,
  },
  {
    id: "ch-yt-003",
    name: "종가베팅TV",
    youtubeId: "UCxxxxxxxxxxxxxxxxxxxxxx3",
    youtubeHandle: "@closingpricebetting_TV",
    thumbnail: "/placeholder-channel.jpg",
    subscriberCount: "-",
    videoCount: 0,
    addedAt: new Date().toISOString(),
    autoSync: true,
  },
  {
    id: "ch-yt-004",
    name: "진짜주식연구소",
    youtubeId: "UCxxxxxxxxxxxxxxxxxxxxxx4",
    youtubeHandle: "@realstock_lab",
    thumbnail: "/placeholder-channel.jpg",
    subscriberCount: "-",
    videoCount: 0,
    addedAt: new Date().toISOString(),
    autoSync: true,
  },
  {
    id: "ch-yt-005",
    name: "한강트레이딩",
    youtubeId: "UCxxxxxxxxxxxxxxxxxxxxxx5",
    youtubeHandle: "@hanriver_trading",
    thumbnail: "/placeholder-channel.jpg",
    subscriberCount: "-",
    videoCount: 0,
    addedAt: new Date().toISOString(),
    autoSync: true,
  },
];

export const mockContents: Content[] = [];

const logLevels = ["info", "warn", "error", "debug", "success"] as const;
const logSources = [
  "WebSocket",
  "TaskRunner",
  "DeviceManager",
  "ADB",
  "Scheduler",
  "API",
  "YouTubeSync",
];
const logMessages = [
  "디바이스 연결 확인 완료",
  "작업 큐에 새 작업이 추가되었습니다",
  "WebSocket 연결이 재설정되었습니다",
  "스크린샷 업로드 완료",
  "YouTube 채널 동기화 시작",
  "새 영상 감지: V-1032",
  "디바이스 D-015 연결 끊김 감지",
  "작업 task-001 진행률 갱신: 72%",
  "노드 PC-05 응답 없음 (타임아웃)",
  "접근성 입력 실패: 재시도 중...",
  "배치 명령 전송 완료 (20개 기기)",
  "네트워크 격리 확인: NET-A01",
  "데이터베이스 동기화 완료",
  "스케줄러 트리거: 다음 작업 시작",
  "메모리 사용량 경고: 85%",
];

export const mockLogs: LogEntry[] = (() => {
  const random = createSeededRandom(42);
  return Array.from({ length: 100 }, (_, i) => ({
    id: `log-${String(i + 1).padStart(4, "0")}`,
    timestamp: new Date(
      1739350800000 - i * 30000 - random() * 10000,
    ).toISOString(),
    level: logLevels[Math.floor(random() * logLevels.length)],
    source: logSources[Math.floor(random() * logSources.length)],
    nodeId: `PC-0${Math.floor(random() * 5) + 1}`,
    deviceId:
      random() > 0.4
        ? `D-${String(Math.floor(random() * 100) + 1).padStart(3, "0")}`
        : null,
    message: logMessages[Math.floor(random() * logMessages.length)],
  }));
})();
