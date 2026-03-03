# Agent 기동 후 자동화 흐름 및 Supabase 연동

Desktop 앱에서 Agent 프로세스가 기동된 뒤, **접속**부터 **다음 작업 자동화**와 **Supabase 연동**이 어떻게 이뤄지는지 정리한다.

---

## 1. 접속 정의

- **접속** = Desktop 앱 기동 후 `agentRunner.startAgent()`가 호출되어 Agent 프로세스가 시작된 상태.
- Agent는 `apps/desktop/src/agent/agent.js`(Dev) 또는 `resources/agent/agent.bundle.cjs`(Dist)로 실행되며, 다음을 수행한다.
  - **Xiaowei WebSocket** 연결 (`config.xiaoweiWsUrl`, 기본 `ws://127.0.0.1:22222/`).
  - **Supabase** 연결: `verifyConnection()`, `getPcId(config.pcNumber)`, `config.loadFromDB()`, Realtime 구독(settings 등).
- 성공 시 Desktop userData 하위에 `agent-ws-status.json`, `agent-devices.json`이 생성·갱신된다.
- 스폰 시 main 프로세스가 전달하는 env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `XIAOWEI_WS_URL`, `PC_NUMBER`, `XIAOWEI_TOOLS_DIR`, `AGENT_WS_STATUS_FILE`, `AGENT_DEVICES_FILE` (getAgentEnv + main 쪽 dotenv).

---

## 2. 다음 작업(자동화 흐름)

접속 후 Agent 내부에서 **자동으로** 돌아가는 흐름이다.

| 레이어 | 과정 | 담당 JS |
|--------|------|---------|
| **1** | 주기 디바이스·PC 동기화 | `device/heartbeat.js` → Xiaowei `list()` → `supabaseSync.batchUpsertDevices()`, `markOfflineDevices()`, PC last_heartbeat 갱신. |
| **4** | task_queue → tasks 1건 + 트리거로 task_devices 생성 | `scheduling/queue-dispatcher.js` (Realtime 또는 30초 폴링). |
| **4** | task_schedules → task_queue enqueue | `scheduling/schedule-evaluator.js` (30초 주기). |
| **4** | task_devices claim → runTaskDevice | `device/device-orchestrator.js` (`claim_task_devices_for_pc` / `claim_next_task_device` RPC → `taskExecutor.runTaskDevice(row)`). |
| **5** | 시청·좋아요·댓글·구독·재생목록 실행, 로그, 완료/실패 RPC | `task/task-executor.js` → `core/xiaowei-client.js`, `core/supabase-sync.js`(insertExecutionLog), `device/device-orchestrator.js`(complete_task_device / fail_or_retry_task_device). |

요약: **레이어 1(하트비트)** → **레이어 4(배정·claim·run)** → **레이어 5(실행·로그·RPC)** 순으로, 수동 개입 없이 Supabase와 연동된다.

---

## 3. Supabase 연동 요약

### 테이블

- **pcs**: PC 등록, last_heartbeat 갱신.
- **devices**: heartbeat에서 batch upsert, 오프라인 마킹.
- **task_queue**: queue-dispatcher가 queued → dispatched, schedule-evaluator가 INSERT.
- **tasks**: queue-dispatcher가 1건 INSERT 시 트리거로 task_devices 생성.
- **task_devices**: claim, complete_task_device / fail_or_retry_task_device RPC.
- **settings**: config 동적 설정, Realtime UPDATE 구독.
- **execution_log**: task-executor가 insertExecutionLog → supabase-sync 배치 flush(50건/3초).

### RPC

- `claim_task_devices_for_pc`, `claim_next_task_device`: device-orchestrator.
- `complete_task_device`, `fail_or_retry_task_device`: device-orchestrator(실행 결과 반영).
- `mark_device_offline`: supabase-sync.markOfflineDevices() 내부.

### Realtime

- **settings** UPDATE: config 구독, config-updated 이벤트(heartbeat/interval 등 live 반영).
- **task_queue** INSERT: queue-dispatcher가 보조로 사용(폴링 30초와 병행).

---

## 4. 검증 포인트

1. **설치본/Dev 실행 후** process가 `agent.bundle.cjs` 또는 `agent.js`를 실행 중인지 확인 (예: 작업 관리자, desktop.log의 `[AgentRunner] ... scriptExists=true`).
2. **userData** 하위 `agent-ws-status.json`, `agent-devices.json` 생성·갱신 여부.
3. **heartbeat**으로 devices 테이블 upsert 여부 (Supabase 대시보드 또는 로그).
4. **claim → runTaskDevice** 로그 및 execution_log·완료/실패 RPC 반영 여부.

실행 경로·파일·env 정리는 [AGENT_SRC_STATUS.md](AGENT_SRC_STATUS.md), 모듈·레이어는 [agent-js-modules-and-layers.md](agent-js-modules-and-layers.md), 5레이어 아키텍처는 [architecture-five-layer-pipeline.md](architecture-five-layer-pipeline.md) 참고.
