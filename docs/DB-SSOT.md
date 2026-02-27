# DB SSOT: scripts, workflows_definitions, task_devices, tasks

Release 1에서 실행·발행의 단일 소스(SSOT)는 아래 테이블과 RPC다.

## 테이블 역할

| 테이블                    | 역할                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **scripts**               | 실행 스크립트 버전 SSOT. `(id, version)` 복합 PK. `content`는 JS/ESM 문자열. `status`: draft \| active \| archived. 실행 시 **active만** 허용.      |
| **workflows_definitions** | 워크플로 정의 SSOT. `(id, version)` 복합 PK. `steps`는 scriptRef + params 배열. 발행 시 여기서 로드 → snapshot 생성 → task_devices.config에 저장.   |
| **task_devices**          | 실행 단위 SSOT. 한 건 = 한 device에 대한 한 workflow 실행. claim/lease/complete·fail RPC로만 상태 변경. `config`에 **snapshot**(steps 스냅샷) 포함. |
| **tasks**                 | 상위 작업(비디오/채널 등). task_devices가 tasks.id를 FK로 참조. 실행은 task_devices만 claim/실행.                                                   |

## Proxy 1:1 (devices ↔ proxies)

- **devices.proxy_id** UNIQUE: one proxy cannot be assigned to multiple devices.  
  Verification: `SELECT indexname FROM pg_indexes WHERE tablename = 'devices' AND indexname = 'devices_proxy_id_unique';`
- **proxies.device_id** UNIQUE: one device cannot have multiple proxies.  
  Verification: `SELECT indexname FROM pg_indexes WHERE tablename = 'proxies' AND indexname LIKE '%device_id%' AND indexdef LIKE '%UNIQUE%';`
- **set_proxy / clear_proxy**: used in `command_logs.command` (no DB CHECK; application allows these values).

## devices.connection_id

- `devices.connection_id`: Xiaowei 연결 식별자(OTG/WiFi 등). NULL이면 USB.
- 실행 타겟: **connection_id ?? serial** (또는 스키마에 따라 serial_number). Agent가 task_device.device_id로 devices 조회 후 이 값을 Xiaowei 요청에 사용.

## RPC (task_devices)

- **claim_task_devices_for_pc**(runner_pc_id, max_to_claim, lease_minutes)  
  해당 PC의 queued task_devices 중 device당 running 1개 제한을 지키며 최대 N건을 running으로 전환, lease 부여. 반환: 전환된 행들.
- **renew_task_device_lease**(task_device_id, runner_pc_id, lease_minutes)  
  running 건의 lease_expires_at 갱신. 30초마다 호출 권장.
- **complete_task_device**(task_device_id, runner_pc_id, result_json)  
  running → completed, result 병합.
- **fail_or_retry_task_device**(task_device_id, runner_pc_id, error_text, retryable)  
  retryable이면 queued로 되돌리고 retry_count 증가, 아니면 failed.

---

## 4대 강제 규칙 (발행·실행 공통)

발행(워크플로 → snapshot → task_devices 생성)과 실행(Agent claim → 스크립트 실행) 양쪽에서 아래를 반드시 지킨다.

1. **버전 고정**  
   실행·발행 시 항상 **(scriptId, version)** / **(workflowId, version)** 을 명시. “최신” 자동 선택 금지.

2. **실행 스냅샷**  
   task_devices.config에는 **발행 시점의 snapshot**이 들어가야 한다.
   - `config.snapshot.steps`: workflows_definitions.steps를 DB에서 resolve(scripts active 검사, timeout_ms 주입)한 결과.
   - 실행 시 이 snapshot만 사용. 실행 중 workflows_definitions/scripts 변경은 이미 할당된 task_device에 영향 없음.

3. **timeout**
   - scripts.timeout_ms를 step/op 수준에서 반영.
   - 발행 시 snapshot.steps 각 op에 timeoutMs 주입(resolve 시 scripts.timeout_ms 사용).
   - 실행 시 op.timeoutMs로 Promise.race 등으로 op 단위 타임아웃 강제.

4. **status = active**
   - scripts: 실행·발행 시 **status = 'active'** 인 행만 사용. 아니면 조회/실행 거부(throw 또는 에러 반환).
   - workflows_definitions: 발행 시 is_active인 정의만 사용.

---

## 발행 경로

- 모든 발행은 **workflows_definitions → (resolve scripts, build snapshot) → task_devices** 생성으로만 이루어진다.
- pipeline, queue, schedule, command 흡수 등 모든 경로가 동일하게 **buildConfigFromWorkflow**(또는 동일 스펙)로 config.snapshot을 만들고, 그 config를 가진 task_devices만 삽입.

## 실행 경로

- Agent는 **task_devices만** claim/lease/retry로 실행한다.
- scripts는 DB에서 **on-demand sync**(getActiveScript → 캐시 .mjs → dynamic import) 후 Node에서 실행.
- tasks 직접 실행, job_assignments 실행 루프, task_queue를 “실행 단위”로 소비하는 경로는 **제거되었거나 실행 경로에서 완전 차단**되어 있으며, 동일 device에 대해 running 1개 제한이 RPC로 유지된다.
