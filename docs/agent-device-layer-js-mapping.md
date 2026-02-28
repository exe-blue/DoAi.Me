# Agent 디바이스 레이어 ↔ JS 매핑

모든 디바이스 단계는 JS로 제어된다. 아래는 **디바이스 이벤트/단계**와 **대응하는 JS 파일** 매핑이며, 미구현이 있으면 추가한다.

---

## 1. 디바이스 레이어 단계와 JS 파일

| 단계 / 이벤트 | 담당 JS | 비고 |
|----------------|---------|------|
| **처음 등록 (IP + 시리얼)** | 웹 `POST /api/devices` | Body: `serial_number`, `connection_id`(IP:5555), `worker_id`(선택). DB에 디바이스 생성. |
| **주기 디바이스 목록 동기화** | `device/heartbeat.js` | Xiaowei `list()` → IP:PORT면 `device-serial-resolver.js`로 하드웨어 시리얼 조회 → `supabase-sync.batchUpsertDevices()` (serial_number + connection_id). IP 변경 시에도 serial_number 기준으로 동일 디바이스로 인식. |
| **디바이스 identity 해석 (IP→시리얼)** | `device/device-serial-resolver.js` | `resolveHardwareSerialsForList()`: list 항목이 IP:PORT면 `getprop ro.serialno` 등으로 하드웨어 시리얼 추출. |
| **실행 타겟 결정 (task_devices)** | `core/supabase-sync.js` → `getDeviceTargetForTaskDevice()` | `device_target` → `devices.connection_id` → `serial_number`. ADB/Xiaowei 명령은 connection_id(IP:5555) 사용. |
| **오프라인 마킹** | `core/supabase-sync.js` → `markOfflineDevices()` | heartbeat에서 현재 목록에 없는 디바이스를 serial_number 기준으로 `mark_device_offline` RPC 호출. |
| **ADB 재연결** | `device/adb-reconnect.js` | 오프라인 디바이스에 재연결 명령 전송. |
| **디바이스 오류율/일괄 오프라인 감지** | `device/device-watchdog.js` | 임계값 초과 시 broadcaster로 이벤트. |
| **작업 선점 (claim)** | `device/device-orchestrator.js` | `claim_task_devices_for_pc` / `claim_next_task_device` RPC, connection id로 실행 대상 결정. |
| **작업 실행 (시청 등)** | `task/task-executor.js` | runTaskDevice → task_type별 Xiaowei/ADB 명령. |
| **시청 완료 시 스크린샷** | `device/screenshot-on-complete.js` | device-orchestrator에서 runTaskDevice 성공 직후 호출. `c:\logging`(또는 LOGGING_DIR)에 `날짜시간-그날작업갯수누적.png` 저장. |
| **연결 직후 optimize** | `device/device-presets.js` + `agent.js` | 첫 연결 시 `presets.optimize()` (효과 줄임, 해상도 1080x1920). |
| **유튜브 명령 전 세로 고정** | `task/task-executor.js` | _watchVideoOnDevice 내 accelerometer_rotation 0, user_rotation 0, content insert. |

---

## 2. 이전에 JS로 구현되지 않았던 단계 (이번에 추가·정리)

| 단계 | 이전 | 현재 |
|------|------|------|
| **처음 등록 (IP+시리얼 2개 관리)** | 없음 | `POST /api/devices` 추가. DB에 `serial_number`(고정 identity) + `connection_id`(현재 IP:5555) 저장. |
| **IP 변경 시에도 시리얼 기준 연속성** | 없음 | heartbeat에서 `device-serial-resolver`로 IP→시리얼 조회 후 serial_number로 upsert, connection_id 갱신. `getDeviceTargetForTaskDevice`에서 connection_id 사용. |
| **시청 완료 시 스크린샷** | 없음 | `device/screenshot-on-complete.js` 추가. device-orchestrator에서 완료 직후 호출, LOGGING_DIR에 날짜시간-누적갯수.png 저장. |

---

## 3. 요약

- **디바이스 식별**: 항상 **serial_number**(하드웨어 시리얼) 기준. **connection_id**(IP:5555)는 현재 연결용으로만 사용하고, heartbeat 시 갱신.
- **명령 실행**: Xiaowei/ADB 호출 시에는 **connection_id** 우선 사용(없으면 serial_number).
- 위 표에 나온 단계는 모두 JS(또는 API Route)로 처리되며, 디바이스 이벤트에 대응하는 JS가 없던 부분은 이번에 추가됨.
