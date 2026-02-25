# IV. Agent ↔ 서버 통신 명세 (알파)

---

## 4.1 Agent → 서버

| 통신방식 | 주기 | API |
|----------|------|-----|
| 하트비트 | HTTP POST | 30초 | `POST /api/workers/heartbeat` |
| 태스크 완료 | HTTP PATCH | 이벤트 | `PATCH /api/tasks` |
| 에러 로그 | HTTP POST | 이벤트 | `POST /api/commands` |
| 기기 상태 | 하트비트에 포함 | 30초 | (heartbeat body) |

---

## 4.2 서버 → Agent

| 통신방식 | 트리거 |
|----------|--------|
| 새 태스크 | Supabase Realtime 구독 | `task_queue` INSERT |
| 즉시 명령 | Supabase Realtime 구독 | `commands` INSERT |
| 설정 변경 | Supabase Realtime 구독 | `settings` UPDATE |

---

## 4.3 하트비트 포맷

```javascript
// POST /api/workers/heartbeat
{
  "worker_id": "PC01",
  "agent_version": "0.1.0-alpha",
  "status": "online",
  "devices": [
    {
      "device_code": "PC01-001",
      "serial": "R58M...",
      "status": "idle",        // idle | working | error | offline
      "battery": 72,
      "proxy_id": "uuid-xxx",
      "account_id": "uuid-yyy",
      "current_task_id": null
    }
    // ... 최대 100대
  ],
  "system": {
    "cpu_usage": 45,
    "memory_free_mb": 2048,
    "adb_server_ok": true,
    "usb_devices_count": 98,   // adb devices 인식 수
    "uptime_seconds": 50400
  }
}
```

---

## 4.4 Realtime 구독 (Agent 측)

```javascript
// agent.js 시작 시
const channel = supabase
  .channel(`worker-${pcNumber}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'task_queue',
    filter: `target_worker=eq.${pcNumber}`
  }, handleNewTask)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'commands',
    filter: `target_worker=eq.${pcNumber}`
  }, handleCommand)
  .subscribe();

// 재연결 + 보완 polling
setInterval(async () => {
  const pending = await supabase
    .from('task_queue')
    .select('*')
    .eq('target_worker', pcNumber)
    .eq('status', 'pending');
  // Realtime 누락분 처리
}, 60000);
```

---

## 구현 노트 (Supabase 유지)

명세의 **의미**를 유지하면서 통신은 **Supabase 직접 사용**으로 구현함.

| 항목 | 명세 | 구현 (Supabase) |
|------|------|------------------|
| **하트비트** | 30초, worker_id·devices·system | 30초. `pcs`에 `agent_version`, `system`(JSONB) 저장. `devices` 배치 upsert 시 `device_code`(PC01-001 형식), `proxy_id`, `account_id`, `current_task_id` 지원. |
| **태스크 완료** | 이벤트 | `tasks` 테이블 직접 update (status, completed_at, result, error). |
| **에러 로그** | 이벤트 | Agent 레벨 오류 시 `command_logs` INSERT (command='agent_error', initiated_by='agent'). uncaughtException/unhandledRejection에서 호출. |
| **새 태스크** | `task_queue` INSERT, target_worker | `task_queue.target_worker` 컬럼 추가. Agent는 `worker-${pcNumber}` 채널로 task_queue INSERT 구독. 수신 시 task 생성 후 실행, queue는 dispatched로 갱신. |
| **즉시 명령** | `commands` INSERT, target_worker | `commands` 테이블 추가. 동일 채널로 commands INSERT 구독. 수신 시 status running → completed/failed 갱신. |
| **설정 변경** | `settings` UPDATE | 기존대로 `config.js`에서 settings UPDATE postgres_changes 구독. |
| **보완 폴링** | 60초, task_queue pending | 60초마다 `getPendingTaskQueueItems(pcNumber)` 호출, queued 건 처리. (tasks 테이블용 5초 폴링은 기존 유지.) |

- **Queue dispatcher**: `target_worker`가 NULL인 항목만 디스패치. 지정 PC 항목은 해당 Agent가 task_queue Realtime으로 수신.
- **마이그레이션**: `supabase/migrations/20260226100000_agent_server_spec.sql`
