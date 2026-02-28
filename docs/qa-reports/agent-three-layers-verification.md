# Agent 3레이어 플로우 검증

요구사항 기준으로 **agent.js** 플로우가 다음 3개 레이어와 Supabase 통신에 명확히 대응하는지 검증한 결과입니다.

---

## 1. 레이어 1: 디바이스 관리 레이어

**기능**: 기기 등록, 디바이스 정보 저장, 하트비트로 서버 연결 확인.  
**Supabase 통신**: **PC / 디바이스 / 하트비트 서버 전송**

| agent.js 단계 | 담당 모듈 | Supabase 동작 |
|---------------|----------|----------------|
| 3. Register PC | supabaseSync.getPcId() | **pcs** 조회/삽입, pc_id·pcUuid 설정 |
| 8. Start heartbeat | device/heartbeat.js startHeartbeat() | 매 주기: **pcs** update (status, last_heartbeat), **devices** batchUpsert (serial_number, pc_id, status, model, battery_level, last_heartbeat), markOfflineDevices, syncDeviceTaskStates |
| (7) ADB reconnect | adb-reconnect.js | devices 상태·재연결 반영 |
| (14a) Device watchdog | device-watchdog.js | 에러 감지 시 broadcaster 등 |

**결과**: 레이어 1은 **명확히 설정됨**. PC 등록 → 하트비트 루프에서 디바이스 목록·상태를 서버(pcs, devices)로 전송.

---

## 2. 레이어 2: 이벤트·작업 관리 레이어

**기능**: DB에 유튜브 영상 등록 시 task_events(task_devices)로 각 PC에 전달, 사전 정의된 최대 기기수만큼 병렬 명령 실행하는 스케줄러.  
**Supabase 통신**: **이벤트 수신 / 이벤트 송신 / 작업 현황**

| agent.js 단계 | 담당 모듈 | Supabase 동작 |
|---------------|----------|----------------|
| 15. Queue dispatcher | scheduling/queue-dispatcher.js | **이벤트 수신**: task_queue Realtime 구독, **이벤트 송신**: task_queue → tasks + task_devices 생성 (PC별·디바이스별) |
| 15. Schedule evaluator | scheduling/schedule-evaluator.js | task_schedules 평가 → **task_queue** 삽입 (이벤트 송신) |
| 15b. Device orchestrator | device/device-orchestrator.js | **이벤트 수신**: claim_task_devices_for_pc / claim_next_task_device RPC로 해당 PC에 할당된 task_devices 가져옴. **작업 현황**: heartbeat에서 syncDeviceTaskStates(task_status, watch_progress 등), broadcaster로 대시보드 스냅샷 |

**결과**: 레이어 2도 **설정됨**. 이벤트는 task_queue → tasks + task_devices 생성으로 “각 PC로 전송”(행 생성 후 agent가 claim). 작업 현황은 task_devices 상태·heartbeat 동기화·broadcaster로 전달.  
**참고**: “task_events”는 현재 스키마에서 **task_devices** 테이블(및 task_queue)로 구현됨.

---

## 3. 레이어 3: 디바이스 명령 제어 레이어

**기능**: 스케줄러 명령에 따른 PC → 스마트폰 명령 실행. 유튜브 시청, 댓글, 좋아요, 담기 등.  
**Supabase 통신**: **디바이스 실행 / 디바이스 에러**

| agent.js 단계 | 담당 모듈 | Supabase 동작 |
|---------------|----------|----------------|
| 15b. Device orchestrator | device-orchestrator.js | claim한 task_device → taskExecutor.runTaskDevice(row) 호출. 성공 시 **complete_task_device** RPC, 실패 시 **fail_or_retry_task_device** RPC |
| 5. Task executor | task/task-executor.js | runTaskDevice() → _watchVideoOnDevice() (시청·댓글·좋아요·담기 등). **task_devices** update(status, completed_at, duration_ms, result 또는 error) |

### 3.1 레이어 3 상세 스펙 (Single Source of Truth)

**사전전달 이벤트값 (1~5)**

1. **유튜브 영상**: 제목, 키워드, 주소. 키워드 없을 경우 제목이 키워드. 최소대기시간, 최대대기시간.
2. **영상 시청**: 영상 최소 시청 %, 영상 최대 시청 %, 영상 액션 확률(좋아요/댓글/담기).
3. **영상 액션**: 영상 댓글 내용, 액션 터치 좌표.
4. **에러 및 로그**: 각 작업 실행 내역과 시간을 로그로 전달.
5. **Xiaowei/API**: 명령 수행 시 무응답·에러 코드 발생 시 3회까지 재시도 후 상태 전이.

**실제 실행 프로세스**

- **0**: 각 단계별로 최소대기시간~최대대기시간만큼 랜덤 대기.
- **1-1**: 유튜브 화면 진입.
- **1-2**: 유튜브 검색바 클릭하여 키워드로 영상 검색.
- **1-3**: 검색결과 확인. 제공된 제목·주소와 동일한 영상 진입.
- **2-1**: 영상 재생.
- **2-2**: 6초 딜레이 후 광고 스킵 진행.
- **2-3**: 영상 최대 길이 파악 후, 영상 최소~최대 시청 % 사이 값으로 시청시간 확정.
- **2-4**: 댓글/좋아요/담기 확률에 따라 시청 중 액션 진행.
- **3-1**: 액션 확정 여부에 따라 명령 수행.
- **3-2**: 확률 결정 후 영상 시청 최대시간 이전에 액션 시간 설정.
- **3-3 (좋아요)**: 좋아요 확정 시 좋아요 클릭.
- **3-4 (댓글)**: 댓글 확정 시 — 제목·내용을 OpenAI에 전달해 댓글 생성 후 입력.
- **3-3 (담기)**: 담기 확정 시 — 명령 아이콘 위치에서 좌로 스와이프 2회 후 "담기" 아이콘 클릭.

**갭**  
- **디바이스 실행/에러**는 **task_devices** 업데이트와 **complete_task_device / fail_or_retry_task_device** RPC로 기록됨.  
- **execution_logs** 테이블에는 **task 레벨** execute(task) 경로에서만 insertExecutionLog()가 호출됨.  
- **runTaskDevice()** 경로(현재 유일한 실행 경로)에서는 **insertExecutionLog()를 호출하지 않음** → 디바이스 단위 실행/에러 로그가 execution_logs에 쌓이지 않음.

**결론**: 레이어 3의 “디바이스 실행/디바이스 에러”는 **task_devices + RPC** 기준으로는 설정되어 있으나, **execution_logs**까지 쌓으려면 runTaskDevice()(또는 _watchVideoOnDevice()) 내부에서 insertExecutionLog로 start/completed/failed를 execution_logs에 기록하도록 구현됨.

---

## 4. agent.js 단계 → 레이어 매핑 요약

| 레이어 | agent.js 단계 | Supabase 항목 |
|--------|----------------|---------------|
| **1. 디바이스 관리** | 3 (PC 등록), 8 (heartbeat), 7 (adb reconnect), 14a (watchdog) | PC, 디바이스, 하트비트 서버 전송 |
| **2. 이벤트·작업 관리** | 15 (queue dispatcher, schedule evaluator), 15b (device orchestrator claim) | 이벤트 수신/송신, 작업 현황 |
| **3. 디바이스 명령 제어** | 15b (orchestrator 실행), 5 (task executor) | 디바이스 실행, 디바이스 에러 |

---

## 5. 권장 사항

1. **agent.js 상단 또는 main() 내부**에 3개 레이어를 주석으로 명시하면, “디바이스 관리 / 이벤트·작업 관리 / 디바이스 명령 제어”가 한눈에 들어옵니다.
2. **레이어 3 보강**: runTaskDevice() 성공/실패 시 supabaseSync.insertExecutionLog()를 호출해 **디바이스 실행/디바이스 에러**를 execution_logs에도 남기면, 대시보드·로그 조회와 요구사항(“디바이스실행/디바이스에러”)을 동일하게 맞출 수 있습니다. (구현됨: start/completed/failed 로그 기록.)

## 6. 스키마 정리 (Layer 3 적용 후)

- **task_queue**: 마이그레이션 `20260213_step12_task_queue_schedules.sql`에 정의. `lib/supabase/database.types.ts`에 task_queue 타입 추가됨.
- **execution_logs**: 마이그레이션 `20260228110000_execution_logs.sql`로 생성. database.types.ts에 execution_logs 타입 추가됨. (execution_id, device_id, status, data, details, level, message.)
- **task_devices**: types에는 retry_count 사용. RPC fail_or_retry_task_device는 실제 DB 컬럼에 따라 다를 수 있음 — DB 기준으로 타입 정리 권장.
