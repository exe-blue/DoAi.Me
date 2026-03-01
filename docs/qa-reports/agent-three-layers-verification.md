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

### 3번 레이어 상세 스펙 (Single Source of Truth)

이 스펙은 레이어 3 디바이스 명령 제어의 **Single Source of Truth**입니다.

**사전전달 이벤트값 (1~5)**

1. **유튜브 영상**: 제목(title), 키워드(keyword), 주소(url). 키워드 없을 경우 제목이 키워드(keyword default = title). 최소대기시간(min_wait_sec), 최대대기시간(max_wait_sec).
2. **영상 시청**: 영상 최소 시청 %(watch_min_pct), 영상 최대 시청 %(watch_max_pct), 영상 액션 확률(prob_like, prob_comment, prob_playlist).
3. **영상 액션**: 영상 댓글 내용(comment_content), 액션 터치 좌표(action_touch_coords).
4. **에러 및 로그**: 각 작업 실행 내역과 시간을 execution_logs에 기록(step 이름, data에 task_device_id/task_id, message).
5. **Xiaowei/API**: 명령 수행 시 무응답·에러 코드 발생 시 3회까지 재시도 후 상태 전이(fail_or_retry_task_device RPC).

**실제 실행 프로세스 (0, 1-1~3-4)**

- **Step 0**: 각 단계별로 최소대기시간~최대대기시간(min_wait_sec~max_wait_sec)만큼 랜덤 대기.
- **1-1**: 유튜브 화면 진입(앱 실행).
- **1-2**: 유튜브 검색바 클릭하여 키워드(config.keyword || config.title)로 영상 검색.
- **1-3**: 검색결과 확인. 제공된 제목·주소와 동일한 영상 진입; 실패 시 직접 URL 폴백.
- **2-1**: 영상 재생.
- **2-2**: 진입 후 약 6초 딜레이 후 광고 스킵(_trySkipAd).
- **2-3**: 영상 최대 길이(ADB/UI 또는 config.duration_sec) 파악 후, watch_min_pct~watch_max_pct 사이 값으로 시청시간 확정.
- **2-4**: 댓글/좋아요/담기 확률에 따라 시청 중 액션 진행.
- **3-1**: 액션 확정 여부에 따라 명령 수행.
- **3-2**: 확률 결정 후 영상 시청 최대시간 이전에 액션 시간 설정.
- **3-3 (좋아요)**: 좋아요 확정 시 좋아요 클릭.
- **3-4 (댓글)**: 댓글 확정 시 — config.comment_content 있으면 사용, 없으면 OpenAI(CommentGenerator)로 생성 후 입력.
- **3-3 (담기)**: 담기 확정 시 — 명령/저장 아이콘 위치에서 좌로 스와이프 2회 후 "담기" 아이콘 클릭(action_touch_coords 있으면 해당 좌표 사용).

**갭**  
- **디바이스 실행/에러**는 **task_devices** 업데이트와 **complete_task_device / fail_or_retry_task_device** RPC로 기록됨.  
- **execution_logs**: runTaskDevice() 경로에서 insertExecutionLog로 start/completed/failed 및 주요 단계(step_0_wait, step_1_1_launch, step_1_2_1_3_search_enter, step_2_2_ad_skip, step_2_1_2_3_play_watch 등) 기록. execution_id = task_device_id, device_id = serial, data에 task_id/task_device_id 포함.
- **Xiaowei/API**: 중요 adb 호출은 _adbShellWithRetry(3회) 사용. 3회 실패 시 예외 전파 → device-orchestrator가 fail_or_retry_task_device 호출.

**결론**: 레이어 3의 “디바이스 실행/디바이스 에러”는 **task_devices + RPC + execution_logs** 기준으로 설정됨.

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

- **task_queue**: 마이그레이션 `20260213_step12_task_queue_schedules.sql`에 정의. `lib/supabase/database.types.ts`에 task_queue 타입 있음. (코드에서 `(sb as any).from("task_queue")` 사용 시 타입에 없으면 주석으로 명시.)
- **execution_logs**: 마이그레이션 `20260228110000_execution_logs.sql`로 생성. 컬럼: id, execution_id (TEXT), device_id (TEXT), status, data (JSONB), details, level, message, created_at. task_device 단위 로깅 시 execution_id = task_device_id (UUID 문자열), device_id = serial, data에 task_id·task_device_id 포함. 테이블에 task_device_id 컬럼 없음 → data 또는 message에 task_device_id 포함.
- **task_devices**: 마이그레이션(20260227, 20260226 등)에서 **retry_count**, **max_retries** 컬럼 사용. RPC fail_or_retry_task_device는 마이그레이션 20260228100000에서 **attempt**, **max_attempts** 참조할 수 있음 — 실제 DB가 retry_count/max_retries이면 RPC 정의와 불일치 가능. 코드·에이전트는 **retry_count**, **max_retries** 기준으로 정리 권장.
- **tasks.payload / task_config**: 동일 키 사용 — watchMinPct, watchMaxPct, waitMinSec, waitMaxSec (lib/types.ts TaskVariables, pipeline payload, 트리거 _payload->>'watchMinSec' 등).
