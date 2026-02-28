# 양방향 플로우 검증 요약 (check-compiler-errors + 코드 추적)

## 1. Compile / type-check 결과

- **`npm run build`**: 성공 (Next.js 프로덕션 빌드 완료).
- **`npm run lint`**: 성공 (ESLint 경고/에러 없음).

---

## 2. 플로우 1: task_devices → PC → Xiaowei → 영상 시청

**경로**: 서버에 task_devices 행 존재 → 연결된 PC의 에이전트가 claim → Xiaowei로 해당 기기에 영상 시청 실행.

| 단계 | 위치 | 검증 내용 |
|------|------|-----------|
| 1) 구독/폴링 | `agent.js` | DeviceOrchestrator 시작 후 3초마다 `_orchestrate()` 실행. |
| 2) 기기 목록 | `device-orchestrator.js` | `xiaowei.list()`로 현재 기기 목록 조회 → `_assignWork(serial)` per device. |
| 3) Claim | `device-orchestrator.js` | `_claimNextTaskDevice(serial)` → RPC `claim_task_devices_for_pc` 또는 `claim_next_task_device` 호출. |
| 4) 실행 | `device-orchestrator.js` | claim 성공 시 `_executeTargetWatch(serial, taskDevice)` → `taskExecutor.runTaskDevice(taskDevice)`. |
| 5) Xiaowei 시청 | `task/task-executor.js` | `runTaskDevice()` → `_watchVideoOnDevice(serial, videoUrl, ...)` → ADB/Xiaowei로 검색·재생·engagement. |
| 6) 완료/실패 반영 | `device-orchestrator.js`, `task-executor.js` | 성공 시 `complete_task_device` RPC + `task_devices` update(status, result). 실패 시 `fail_or_retry_task_device` RPC + `task_devices` update(error). |

**정리**: task_devices 한 행 단위로 claim → runTaskDevice → Xiaowei 시청 → task_devices/result·error 및 RPC로 완료/실패가 기록되는 흐름이 코드상 일치함.

---

## 3. 플로우 2: 기기 등록·유지 + 디바이스 수 변경 시 IP:5555·시리얼 유지 + 로그/에러 수집

### 3.1 기기가 처음 서버에 연결될 때 등록

| 단계 | 위치 | 검증 내용 |
|------|------|-----------|
| 1) Heartbeat 시작 | `agent.js` | `startHeartbeat(...)` 호출 → 주기적으로 `beat()` 실행. |
| 2) Xiaowei 기기 목록 | `device/heartbeat.js` | `beat()` 내부에서 `xiaowei.list()` 호출 → `parseDeviceList(response)`로 정규화. |
| 3) 등록 | `device/heartbeat.js` | `supabaseSync.batchUpsertDevices(devices, pcId)` → `devices` 테이블에 serial_number, pc_id, status, model, battery_level, last_heartbeat 등 upsert. |
| 4) parseDeviceList | `device/heartbeat.js` | Xiaowei 응답이 배열/객체/맵(serial→info) 형태 모두 처리. `serial` = d.serial \|\| d.id \|\| d.deviceId. **IP:5555** 형태는 Xiaowei가 키로 주면 그대로 serial로 저장됨. |

**정리**: 기기 목록은 Xiaowei에서 주기적으로 가져와 `devices` 테이블에 반영되며, IP:5555 식별자도 serial로 저장 가능함.

### 3.2 디바이스 숫자가 바뀔 때마다 현재 실행 중인 디바이스 유지 (IP:5555·시리얼)

| 단계 | 위치 | 검증 내용 |
|------|------|-----------|
| 1) 매 beat 목록 | `device/heartbeat.js` | 매 주기마다 `xiaowei.list()` → `parseDeviceList()` → `currentSerials` 집합 갱신. |
| 2) 오프라인/에러 처리 | `device/heartbeat.js` | `prevSerials`와 비교해 사라진 기기는 `errorSerials` 또는 offline 처리. `markOfflineDevices(pcId, activeSerials, errorSerials)` 호출. |
| 3) DB 반영 | `core/supabase-sync.js` | `markOfflineDevices()`: 해당 PC에서 `activeSerials`에 없으면 status=offline, errorSerials면 status=error. `.not("serial_number", "in", allKnownSerials)` 로 “현재 연결된 기기”만 제외하고 나머지 offline 처리. |
| 4) Orchestrator 맵 갱신 | `device/heartbeat.js` | `upsertedRows`로 `orchestrator.updateDeviceIdMap(upsertedRows)` 호출 → device_id ↔ serial(또는 serial_number) 매핑 유지. |
| 5) 실행 타겟 해석 | `core/supabase-sync.js` | DeviceOrchestrator 경로는 `taskDevice.device_serial`을 그대로 Xiaowei 타겟으로 사용(시리얼 또는 IP:5555). `getDeviceTargetForTaskDevice`는 task_devices에 device_id 있을 때 device_target 해석용. |

**정리**: 디바이스 수가 바뀔 때마다 heartbeat가 목록을 갱신하고, 그에 맞춰 DB의 online/offline/error와 orchestrator의 device_id↔serial 매핑이 유지됨. IP:5555는 serial_number 또는 connection_id로 저장·해석되도록 되어 있음.

### 3.3 플로우 1 발생 시 로그·에러 수집

| 수집처 | 위치 | 내용 |
|--------|------|------|
| task_devices 행 | `task-executor.js` | `runTaskDevice()` 성공 시 `_updateTaskDevice(id, "completed", { completed_at, duration_ms, result: { watchPercentage, liked, commented } })`. 실패 시 `_updateTaskDevice(id, "failed", { error })`. |
| RPC | `device/device-orchestrator.js` | 성공 시 `complete_task_device(p_task_device_id)`, 실패 시 `fail_or_retry_task_device(p_task_device_id, p_error)`. |
| execution_logs | `core/supabase-sync.js` | **task 레벨** `execute(task)` 경로에서만 `insertExecutionLog(...)` 호출됨. **task_device(claim) 경로**의 `runTaskDevice()`에서는 호출하지 않음. |

**갭**: 플로우 1이 **DeviceOrchestrator → runTaskDevice**로만 돌 때, 상세 단계 로그는 `task_devices.result` / `task_devices.error`와 RPC로만 남고, `execution_logs` 테이블에는 기록되지 않음. 로그/에러를 execution_logs에도 남기려면 `runTaskDevice()` 또는 `_watchVideoOnDevice()` 내부에서 `insertExecutionLog`를 호출하도록 추가하는 수정이 필요함.

---

## 4. 양방향 검증 요약

- **플로우 1 (task_devices → 영상 시청)**:  
  task_devices claim → runTaskDevice → Xiaowei 시청 → complete/fail RPC 및 task_devices 업데이트까지 코드 경로 일치. 빌드/린트 통과.

- **플로우 2 (기기 등록·유지)**:  
  최초 연결·이후 주기적으로 Xiaowei list → batchUpsertDevices로 등록, 디바이스 수 변경 시 markOfflineDevices·updateDeviceIdMap으로 “현재 실행 중인 디바이스”와 IP:5555/시리얼 유지. 코드상 일치.

- **플로우 1 시 로그/에러 수집**:  
  task_devices.result·error 및 RPC로 수집됨. execution_logs는 task 레벨 execute() 경로에서만 사용 중이므로, claim 경로에서도 execution_logs를 채우려면 추가 수정 필요.
