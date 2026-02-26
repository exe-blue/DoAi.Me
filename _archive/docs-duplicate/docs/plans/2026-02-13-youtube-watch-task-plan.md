# YouTube Watch Task Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dashboard에서 YouTube 시청 태스크 생성 → Agent 청크 병렬 실행 → 디바이스별 진행률 실시간 표시

**Architecture:** Chunked parallel execution (5대씩) with per-device tracking via task_devices table. adbShell for app launch, autojsCreate for watch script.

**Tech Stack:** TypeScript (agent/src), React/Next.js (dashboard), Supabase Broadcast (realtime)

---

### Task 1: youtube_watch.js — 기본 시청 스크립트 구현

**Files:**
- Modify: `scripts/youtube_watch.js`

**Step 1: youtube_watch.js 기본 구현 작성**

```javascript
// Xiaowei AutoJS - YouTube 시청 스크립트
// Agent가 adbShell로 YouTube 앱을 먼저 실행한 후 이 스크립트 호출
// 파라미터는 Xiaowei autojsCreate의 data 필드로 전달됨

var videoUrl = engines.myEngine().execArgv.videoUrl || "";
var watchDuration = engines.myEngine().execArgv.watchDuration || 30000;

if (videoUrl) {
  shell("am start -a android.intent.action.VIEW -d '" + videoUrl + "'");
}

sleep(watchDuration);
```

**Step 2: Commit**

```bash
git add scripts/youtube_watch.js
git commit -m "feat(script): implement basic youtube_watch.js for video viewing"
```

---

### Task 2: Agent — executeYouTubeTask() 청크 병렬 실행 엔진

**Files:**
- Modify: `agent/src/agent.ts`

**Context:** 현재 `dispatchTask()`는 youtube 타입을 actionCreate/autojsCreate로 직접 라우팅. 새로운 `executeYouTubeTask()`가 청크 분할 + task_devices 추적 + adbShell → autojsCreate 2단계 실행을 담당.

**Step 1: helper 함수 추가**

`agent/src/agent.ts` 상단에 추가:

```typescript
const CHUNK_SIZE = 5;
const APP_LAUNCH_DELAY = 3000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface YouTubePayload {
  videoUrl?: string;
  scriptPath?: string;
  watchDuration?: number;
  actionName?: string;
  variables?: Record<string, unknown>;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function resolveDeviceSerials(task: TaskRow): string[] {
  if (task.target_devices && task.target_devices.length > 0) {
    return task.target_devices;
  }
  // Fallback: use all connected devices from xiaowei
  if (xiaowei.connected) {
    return xiaowei.lastDevices?.map(d => d.serial).filter(Boolean) ?? [];
  }
  return [];
}
```

**Step 2: executeYouTubeTask() 구현**

```typescript
async function executeYouTubeTask(task: TaskRow): Promise<void> {
  const serials = resolveDeviceSerials(task);
  if (serials.length === 0) throw new Error("No target devices available");

  const payload = (task.payload ?? {}) as YouTubePayload;
  const scriptPath = payload.scriptPath || "youtube_watch.js";
  const videoUrl = payload.videoUrl || "";

  // 1. Insert task_device rows
  const deviceRowIds = new Map<string, string>();
  for (const serial of serials) {
    const id = await sync.insertTaskDevice({
      task_id: task.id,
      device_serial: serial,
      worker_id: sync.workerId,
      status: "running",
      xiaowei_action: "youtube_watch",
    });
    if (id) deviceRowIds.set(serial, id);
  }

  // 2. Chunk and execute
  const chunks = chunkArray(serials, CHUNK_SIZE);
  let doneCount = 0;
  let failCount = 0;

  for (const chunk of chunks) {
    const devicesStr = chunk.join(",");

    try {
      // Step A: Launch YouTube app
      await xiaowei.adbShell(devicesStr,
        "am start -n com.google.android.youtube/.HomeActivity");
      await sleep(APP_LAUNCH_DELAY);

      // Step B: Run watch script
      const scriptOpts = {
        count: 1,
        taskInterval: [2000, 5000] as [number, number],
        deviceInterval: "1000",
      };
      await xiaowei.autojsCreate(devicesStr, scriptPath, scriptOpts);

      // Step C: Mark chunk devices done
      for (const serial of chunk) {
        const rowId = deviceRowIds.get(serial);
        if (rowId) {
          await sync.updateTaskDevice(rowId, "done", { videoUrl });
        }
        doneCount++;
      }
    } catch (err) {
      const errMsg = (err as Error).message;
      for (const serial of chunk) {
        const rowId = deviceRowIds.get(serial);
        if (rowId) {
          await sync.updateTaskDevice(rowId, "failed", undefined, errMsg);
        }
        failCount++;
      }

      // Log chunk failure
      await sync.insertTaskLog({
        task_id: task.id,
        worker_id: sync.workerId,
        action: "youtube_watch_chunk_failed",
        level: "error",
        message: `Chunk [${chunk.join(",")}] failed: ${errMsg}`,
      });
    }

    // Step D: Broadcast progress
    await sync.updateTaskStatus(task.id, "running", {
      done: doneCount, failed: failCount, total: serials.length,
    });
  }

  // 3. Final status
  const finalStatus = failCount === serials.length ? "failed" : "completed";
  await sync.updateTaskStatus(task.id, finalStatus, {
    total: serials.length, done: doneCount, failed: failCount,
  });
}
```

**Step 3: executeTask()에서 youtube 분기 연결**

`executeTask()` 함수 내부에서 youtube 타입일 때 `executeYouTubeTask()`를 호출하도록 분기:

```typescript
// executeTask() 내부
if (taskType === "youtube" || taskType === "watch_video") {
  await executeYouTubeTask(task);
} else {
  const result = await dispatchTask(taskType, task, devices);
  await sync.updateTaskStatus(task.id, "completed", result as Record<string, unknown>);
}
```

**Step 4: xiaowei-client에 lastDevices 프로퍼티 추가**

`agent/src/xiaowei-client.ts`에 마지막 list() 결과를 캐싱하는 프로퍼티 추가:

```typescript
// XiaoweiClient 클래스 내
public lastDevices: XiaoweiDevice[] = [];

async list(): Promise<XiaoweiDevice[]> {
  const resp = await this.send({ action: "list" });
  this.lastDevices = this.parseDeviceList(resp);
  return this.lastDevices;
}
```

**Step 5: Build 확인**

```bash
cd agent && npx tsc --noEmit
```

Expected: 0 errors

**Step 6: Commit**

```bash
git add agent/src/agent.ts agent/src/xiaowei-client.ts
git commit -m "feat(agent): add YouTube chunked parallel execution engine with per-device tracking"
```

---

### Task 3: Agent — broadcastTaskProgress() 추가

**Files:**
- Modify: `agent/src/broadcaster.ts`

**Step 1: broadcastTaskProgress 메서드 추가**

```typescript
async broadcastTaskProgress(
  taskId: string,
  done: number,
  failed: number,
  total: number
): Promise<void> {
  await this.sendBroadcast(`room:task:${taskId}`, "progress", {
    task_id: taskId,
    done,
    failed,
    total,
    timestamp: new Date().toISOString(),
  });
}
```

**Step 2: executeYouTubeTask()에서 broadcaster 호출 연결**

`agent/src/agent.ts`의 Step D에서 `sync.updateTaskStatus` 이후:

```typescript
await broadcaster.broadcastTaskProgress(task.id, doneCount, failCount, serials.length);
```

**Step 3: Build 확인**

```bash
cd agent && npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add agent/src/broadcaster.ts agent/src/agent.ts
git commit -m "feat(agent): broadcast task progress per chunk completion"
```

---

### Task 4: Dashboard — RegisterTaskDialog 제출 완성

**Files:**
- Modify: `components/tasks-page.tsx`

**Context:** RegisterTaskDialog는 현재 UI shell. videoUrl 입력, deviceCount, variables 설정 UI는 있지만 POST /api/tasks 호출이 없음.

**Step 1: RegisterTaskDialog에 제출 로직 추가**

```typescript
async function handleSubmit() {
  setSubmitting(true);
  try {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrl,
        channelId: selectedChannelId || undefined,
        deviceCount: deviceCount || 20,
        workerId: selectedWorkerId || undefined,
        variables,
      }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Task creation failed");
    // Close dialog and refresh
    onClose();
    onTaskCreated?.();
  } catch (err) {
    setError((err as Error).message);
  } finally {
    setSubmitting(false);
  }
}
```

**Step 2: Build 확인**

```bash
npx next build 2>&1 | head -20
```

**Step 3: Commit**

```bash
git add components/tasks-page.tsx
git commit -m "feat(dashboard): wire RegisterTaskDialog to POST /api/tasks"
```

---

### Task 5: Dashboard — TaskItem 진행률 실데이터 표시

**Files:**
- Modify: `lib/mappers.ts`
- Modify: `components/tasks-page.tsx`

**Step 1: mapTaskRow() progress 계산 변경**

`lib/mappers.ts`에서 hardcoded progress를 result 기반으로:

```typescript
// 기존: progress: status === "running" ? 50 : status === "completed" ? 100 : 0
// 변경:
function calculateProgress(status: string, result: Record<string, unknown> | null): number {
  if (status === "completed" || status === "done") return 100;
  if (status === "failed") {
    // 실패 시 완료처럼 100이 아니라 실제 처리 비율 반환
    if (result && typeof result.total === "number" && result.total > 0) {
      const done = (result.done as number) || 0;
      const failed = (result.failed as number) || 0;
      return Math.round(((done + failed) / result.total) * 100);
    }
    return 0;
  }
  if (status === "pending" || status === "assigned") return 0;
  // running — check result for per-device progress
  if (result && typeof result.total === "number" && result.total > 0) {
    const done = (result.done as number) || 0;
    const failed = (result.failed as number) || 0;
    return Math.round(((done + failed) / result.total) * 100);
  }
  return 0; // running but no progress data yet
}
```

**Step 2: TaskItem에 done/failed 세부 표시 추가**

진행률 바 옆에 `15/20 성공, 1/20 실패` 텍스트:

```tsx
{task.result?.total && (
  <span className="text-xs text-gray-400">
    {task.result.done}/{task.result.total} 성공
    {task.result.failed > 0 && `, ${task.result.failed} 실패`}
  </span>
)}
```

**Step 3: Build 확인**

```bash
npx next build 2>&1 | head -20
```

**Step 4: Commit**

```bash
git add lib/mappers.ts components/tasks-page.tsx
git commit -m "feat(dashboard): show real per-device progress from task result"
```

---

### Task 6: Integration Verification

**Step 1: TypeScript build 확인 (agent + dashboard)**

```bash
cd /home/choi/projects/doai.me/agent && npx tsc --noEmit
cd /home/choi/projects/doai.me && npx next build 2>&1 | tail -5
```

**Step 2: 코드 흐름 검증**

- RegisterTaskDialog → POST /api/tasks → createManualTask() 연결 확인
- Agent executeTask() → youtube 분기 → executeYouTubeTask() 연결 확인
- executeYouTubeTask() → insertTaskDevice → adbShell → autojsCreate → updateTaskDevice 흐름 확인
- progress broadcast → useTasksBroadcast onUpdate → mapTaskRow progress 반영 확인

**Step 3: Event name audit**

```bash
grep -r "room:task" agent/src/ hooks/ components/ --include="*.ts" --include="*.tsx"
```

Verify consistent topic naming across agent and dashboard.
