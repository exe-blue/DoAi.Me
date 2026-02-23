# DoAi.Me Agent — DB 스키마 정합성 마이그레이션 지시서

## 배경
실제 Supabase DB 스키마와 JS 코드 간 불일치가 있다. 코드를 DB에 맞춰야 한다.
Supabase URL: https://vyfxrplzhskncigyfkaz.supabase.co

## 1. 핵심 테이블명 변경

전체 agent/*.js 파일에서:

| 코드 (현재) | 실제 DB | 적용 파일 |
|---|---|---|
| `from("workers")` | `from("pcs")` | supabase-sync.js, agent.js, heartbeat.js 등 |
| `from("task_logs")` | `from("execution_logs")` | supabase-sync.js, task-executor.js |
| `from("task_devices")` | `from("job_assignments")` | task-executor.js, supabase-sync.js |
| `from("presets")` | `from("workflows")` | 해당 파일 있으면 변경 |
| `from("proxies")` | 유지 (proxies 테이블이 실제로 존재하면 유지, 없으면 devices.proxy 컬럼 사용) |

## 2. 컬럼명 변경

### workers → pcs 테이블
| 코드 (현재) | 실제 DB |
|---|---|
| `hostname` (workers) | `pc_number` (pcs) — "PC00" 형식 |
| `worker_id` | `pc_id` |
| `workerName` / `WORKER_NAME` | `pcNumber` / `PC_NUMBER` |

### devices 테이블
| 코드 (현재) | 실제 DB |
|---|---|
| `serial` | `serial_number` |
| `worker_id` | `pc_id` |
| `last_seen` | `last_seen_at` |
| `battery_level` (일부) | `battery_level` (동일) |
| `ip_intranet` | `metadata.intranet_ip` 또는 없음 |

### task_logs → execution_logs 테이블
| 코드 (현재) | 실제 DB |
|---|---|
| `task_id` | `execution_id` |
| `worker_id` | 없음 (삭제) |
| `action` | `status` |
| `request` / `response` | `data` / `details` |

## 3. config.js 변경

```javascript
// BEFORE
this.workerName = process.env.WORKER_NAME || "node-pc-01";

// AFTER  
this.pcNumber = process.env.PC_NUMBER || "PC00";
// PC_NUMBER는 ^PC[0-9]{2}$ 형식 필수 (DB 체크제약)
```

.env 파일도 변경:
```
# BEFORE
WORKER_NAME=local-test-pc

# AFTER
PC_NUMBER=PC00
```

## 4. xiaowei-client.js — API 버그 수정 (중요!)

wscat 테스트로 확인된 버그 2개:

### 버그 1: adbShell action 이름
```javascript
// BEFORE (틀림)
adbShell(devices, command) {
    return this.send({
      action: "adbShell",    // ← 이게 안 먹음
      devices,
      data: [{ command }],   // ← 배열도 틀림
    });
}

// AFTER (정확)
adbShell(devices, command) {
    return this.send({
      action: "adb_shell",   // ← 언더스코어!
      devices,
      data: { command },     // ← 객체! (배열 아님)
    });
}
```

### 버그 2: pointerEvent data 형식
```javascript
// BEFORE (틀림)
pointerEvent(devices, action, x, y) {
    return this.send({
      action: "pointerEvent",
      devices,
      data: [{ action, x, y }],  // ← 배열, 필드명 틀림
    });
}

// AFTER (정확 — API 문서 기준)
// type: "0"=press, "1"=release, "2"=move, "3"=scroll_up, "4"=scroll_down,
//       "5"=swipe_up, "6"=swipe_down, "7"=swipe_left, "8"=swipe_right
pointerEvent(devices, type, x, y) {
    return this.send({
      action: "pointerEvent",
      devices,
      data: { type: String(type), x: String(x || "50"), y: String(y || "50") },
    });
}
```

### 추가해야 할 메서드들 (현재 없음)

```javascript
/** ADB 전체 명령 (adb 접두사 포함) */
adb(devices, command) {
    return this.send({
      action: "adb",
      devices,
      data: { command },
    });
}

/** 앱 실행 */
startApk(devices, packageName) {
    return this.send({
      action: "startApk",
      devices,
      data: { apk: packageName },
    });
}

/** 앱 종료 */
stopApk(devices, packageName) {
    return this.send({
      action: "stopApk",
      devices,
      data: { apk: packageName },
    });
}

/** APK 설치 */
installApk(devices, filePath) {
    return this.send({
      action: "installApk",
      devices,
      data: { path: filePath },
    });
}

/** 앱 제거 */
uninstallApk(devices, packageName) {
    return this.send({
      action: "uninstallApk",
      devices,
      data: { apk: packageName },
    });
}

/** 스크린샷 */
screen(devices, savePath) {
    return this.send({
      action: "screen",
      devices,
      data: savePath ? { path: savePath } : {},
    });
}

/** 네비게이션 키 이벤트 */
// type: "0"=뒤로, "1"=홈, "2"=최근앱
pushEvent(devices, type) {
    return this.send({
      action: "pushEvent",
      devices,
      data: { type: String(type) },
    });
}

/** 클립보드 쓰기 */
writeClipBoard(devices, text) {
    return this.send({
      action: "writeClipBoard",
      devices,
      data: { text },
    });
}

/** 설치된 앱 목록 */
apkList(devices) {
    return this.send({
      action: "apkList",
      devices,
      data: {},
    });
}

/** 입력기 목록 */
imeList(devices) {
    return this.send({
      action: "imeList",
      devices,
      data: {},
    });
}

/** 디바이스 정보 업데이트 */
updateDevices(devices, data) {
    return this.send({
      action: "updateDevices",
      devices,
      data,
    });
}

// ── 편의 메서드 ──

/** 홈 버튼 */
goHome(devices) {
    return this.pushEvent(devices, "1");
}

/** 뒤로 가기 */
goBack(devices) {
    return this.pushEvent(devices, "0");
}

/** 최근 앱 */
recentApps(devices) {
    return this.pushEvent(devices, "2");
}

/** 탭 (press + 50ms + release) */
async tap(devices, x, y) {
    await this.pointerEvent(devices, "0", x, y);  // press
    await new Promise(r => setTimeout(r, 50));
    return this.pointerEvent(devices, "1", x, y);  // release
}

/** 위로 스와이프 */
swipeUp(devices) {
    return this.pointerEvent(devices, "5", "50", "50");
}

/** 아래로 스와이프 */
swipeDown(devices) {
    return this.pointerEvent(devices, "6", "50", "50");
}
```

## 5. supabase-sync.js 핵심 변경

### getWorkerId → getPcId
```javascript
// BEFORE
async getWorkerId(hostname) {
    const { data: existing } = await this.supabase
      .from("workers").select("id").eq("hostname", hostname).single();
    ...
}

// AFTER
async getPcId(pcNumber) {
    const { data: existing } = await this.supabase
      .from("pcs").select("id, pc_number").eq("pc_number", pcNumber).single();
    ...
    this.pcId = existing.id;  // workerId → pcId
    ...
}
```

### syncDevices 컬럼 매핑
```javascript
// BEFORE
await this.supabase.from("devices").upsert({
    serial: d.serial,
    worker_id: this.workerId,
    ...
}, { onConflict: "serial" });

// AFTER
await this.supabase.from("devices").upsert({
    serial_number: d.serial,
    pc_id: this.pcId,
    ...
}, { onConflict: "serial_number" });
```

### 하트비트
```javascript
// BEFORE
await this.supabase.from("workers").update({
    status: "online",
    last_heartbeat: new Date().toISOString(),
    ...
}).eq("id", this.workerId);

// AFTER
await this.supabase.from("pcs").update({
    status: "online",
    last_heartbeat: new Date().toISOString(),
    ...
}).eq("id", this.pcId);
```

### verifyConnection
```javascript
// BEFORE
const { error } = await this.supabase.from("workers").select("id").limit(1);

// AFTER
const { error } = await this.supabase.from("pcs").select("id").limit(1);
```

### insertTaskLog → insertExecutionLog
```javascript
// BEFORE
await this.supabase.from("task_logs").insert({
    task_id: ...,
    worker_id: ...,
    action: ...,
    level: ...,
    message: ...,
    request: ...,
    response: ...,
});

// AFTER
await this.supabase.from("execution_logs").insert({
    execution_id: ...,   // was task_id
    device_id: ...,      // optional
    level: ...,
    status: ...,         // was action
    message: ...,
    data: ...,           // was request
    details: ...,        // was response
});
```

## 6. heartbeat.js 변경

heartbeat에서 workers 테이블 관련 호출을 pcs로 변경.
`updateWorkerStatus(workerId, ...)` → `updatePcStatus(pcId, ...)`

## 7. task-executor.js 변경

- `task_devices` → `job_assignments`
- `worker_id` → 삭제 또는 `agent_id`로 변경
- `task_logs` → `execution_logs`

## 8. .env 파일 수정

```env
# DoAi.Me Agent v3.0
PC_NUMBER=PC00
SUPABASE_URL=https://vyfxrplzhskncigyfkaz.supabase.co
SUPABASE_ANON_KEY=<새 anon key>
SUPABASE_SERVICE_ROLE_KEY=<REPLACE_WITH_SERVICE_ROLE_KEY>
XIAOWEI_WS_URL=ws://10.0.7.49:22222/
HEARTBEAT_INTERVAL=30000
TASK_POLL_INTERVAL=5000
MAX_CONCURRENT_TASKS=20
```

**중요:** `SUPABASE_SERVICE_ROLE_KEY`는 Supabase 대시보드에서 새 Service Role Key를 발급해 넣으세요. 이 문서에 노출된 키가 있었다면 **반드시 대시보드에서 해당 키를 회전(regenerate)한 뒤** 새 키를 사용해야 합니다.

## 9. 검증된 API 사양 (wscat 테스트 완료)

Xiaowei WebSocket: ws://127.0.0.1:22222/ (Android), ws://127.0.0.1:33333/ (iOS)

### 검증 완료된 명령:
```json
// 디바이스 목록
{"action":"list"}

// ADB Shell (언더스코어! data는 객체!)
{"action":"adb_shell","devices":"serial","data":{"command":"getprop ro.product.model"}}

// ADB 전체 (data는 객체!)
{"action":"adb","devices":"serial","data":{"command":"adb shell getprop ro.build.version.release"}}

// 앱 실행
{"action":"startApk","devices":"serial","data":{"apk":"com.google.android.youtube"}}

// 앱 종료
{"action":"stopApk","devices":"serial","data":{"apk":"com.google.android.youtube"}}

// 화면 탭 (좌표는 0~100% 문자열!)
{"action":"pointerEvent","devices":"serial","data":{"type":"0","x":"50","y":"50"}}

// 홈 버튼
{"action":"pushEvent","devices":"serial","data":{"type":"1"}}

// YouTube URL 직접 열기
{"action":"adb_shell","devices":"serial","data":{"command":"am start -a android.intent.action.VIEW -d 'https://www.youtube.com/watch?v=VIDEO_ID'"}}

// 텍스트 입력
{"action":"inputText","devices":"serial","data":{"text":"hello"}}
```

### 응답 형식:
```json
{"code":10000,"message":"SUCCESS","data":...}
// code: 10000=성공, 10001=실패
```

## 10. 변경하지 말 것

- proxy-manager.js — 프록시 로직은 현재 SocksDroid로 처리 중, 나중에 변경
- schedule-evaluator.js, queue-dispatcher.js — 스케줄링 로직은 유지
- 전체 파일 구조 (CommonJS) — ES Module로 바꾸지 말 것

## 우선순위

1. **xiaowei-client.js** — adb_shell 버그 수정 + 누락 메서드 추가 (가장 중요)
2. **config.js + .env** — PC_NUMBER 변경
3. **supabase-sync.js** — workers → pcs, 컬럼명 변경
4. **heartbeat.js** — workers → pcs
5. **agent.js** — workerName → pcNumber 참조 변경
6. **task-executor.js** — task_logs → execution_logs