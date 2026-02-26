# 대기열(task_queue) vs 작업관리(tasks) 흐름

## 1. 몇 대 기준으로 재생하나요?

- **PC당 기본 최대 20대**입니다 (가드레일: PC 단위).
- 디스패치 시 `createBatchTask()`는 **PC별로** `task_devices`를 만듭니다.
  - `pcs` 테이블의 각 PC에 대해, 해당 PC 소속 `devices`를 최대 **20대**까지 조회해, 같은 task에 대해 **PC당 최대 20행**을 넣습니다.
  - 각 `task_devices` 행에는 `pc_id`가 들어가서, **다른 PC가 해당 행을 가져가거나 리필하지 않습니다.**
- 따라서 **한 영상당**
  - `tasks` 테이블에 **1건**
  - `task_devices` 테이블에 **PC 수 × (PC당 최대 20대)** 만큼 행이 생성됩니다 (PC에 기기가 없으면 그 PC는 0건).
- 20대 상한과 “한 대 끝나면 한 대 추가” 리필 규칙은 **모두 PC 안으로만** 적용됩니다. 80대 남은 PC가 있어도, 10대만 남은 다른 PC의 태스크를 그쪽에서 불러오지 않습니다.

---

## 2. 한 대가 먼저 시청을 끝내면 어떻게 되나요?

- **디바이스 단위**: 각 기기는 `task_devices` **한 행**에 대응합니다.
  - 한 대가 시청을 끝내면, 에이전트가 그 행의 `status`를 `completed` / `done`으로 업데이트합니다.
- **자동 반영 (DB 트리거)**  
  `task_devices`가 INSERT/UPDATE/DELETE될 때마다 **`fn_sync_task_progress`** 트리거가 돌아갑니다.
  - 해당 `task_id`에 대해 `task_devices` 중 `status IN ('done','completed')` 개수 → `tasks.devices_done`
  - `status = 'failed'` 개수 → `tasks.devices_failed`
  - 즉, **한 대가 끝날 때마다** 그 task의 `devices_done`이 1씩 증가합니다.
- **리필 규칙 (영상보다 기기 우선, PC 단위)**  
  **`fn_refill_task_device_on_complete`** 트리거: 한 대가 완료되면 같은 PC에서 (1) **우선** 다른 태스크(다음 대기 영상)에 걸린 pending 디바이스 1건을 찾아 현재 시청 중인 영상 태스크로 재배정하고, (2) 그런 행이 없을 때만 새 pending 1건을 INSERT. 대기열에 남은 디바이스를 현재 영상 쪽으로 끌어와 기기 모두가 한 영상을 보는 것을 우선함.  
  → 한 대가 먼저 끝나면 그 **PC 안에서만** “시작하지 않은 한 대”가 추가되어, 동시 시청 대수를 PC별로 유지합니다.
- **task 전체가 “완료”되는 시점**  
  `tasks.status`를 `completed`로 바꾸는 것은 **트리거가 아니라 에이전트**입니다.  
  현재 에이전트(task-executor 등)는 **해당 task에 붙은 모든 디바이스 시청을 한 번에 실행하고, 다 끝난 뒤에 한 번만** `updateTaskStatus(task.id, "completed")`를 호출합니다.  
  따라서:
  - **한 대만** 먼저 끝나면 → 그 대의 `task_devices`만 completed, `devices_done` 1 증가 + **대기열(다음 영상) pending 1건을 현재 영상으로 재배정** 또는 없으면 리필로 pending 1건 추가 (영상보다 기기 우선).
  - **모든 대가** 끝나면 → 에이전트가 `tasks.status = "completed"`로 업데이트 → “작업관리”에서 완료된 시청으로 보입니다.

정리하면, 한 대가 먼저 끝나면 **대기열(다음 영상)에 걸린 디바이스 하나를 현재 영상 태스크로 재배정**하고, 그런 행이 없을 때만 같은 task에 새 pending 1건을 추가한다. **전체 완료는 “모든 대 시청 종료 후”** 에이전트가 한 번 처리합니다.

---

## 3. 대기열 vs 작업관리 — 어떤 지점에서 완료로 들어가나요?

### 대기열 (현재 “재생할 예정” + “재생 중”)

- **데이터**: `task_queue` 테이블.
- **의미**:
  - `status = 'queued'`: 아직 디스패치 안 됨 → **재생 대기**.
  - 디스패치된 항목은 `status = 'dispatched'`가 되고, 그때 생성된 **tasks**가 “현재 재생 중” 또는 “재생할 작업”이 됨.
- 즉, **대기열 = “아직 재생으로 넘기지 않은 것” + “방금 넘겨서 만들어진 tasks(재생 중/대기)”** 라고 보면 됩니다.

### 작업관리 (이미 다 시청한 영상)

- **데이터**: `tasks` 테이블.
- **의미**:
  - 대시보드 “작업/콘텐츠” 등에서 보는 **작업 목록**이 이 테이블 기준입니다.
  - `status = 'completed'` 또는 `'done'` → **이미 다 시청한 영상**.
  - `status = 'pending'` / `'running'` → 아직 재생 중이거나 대기 중.

### 지점 정리

| 구간 | 어디서 어디로 | 설명 |
|------|----------------|------|
| **대기열 → 작업으로 들어감** | `task_queue` (queued) → `tasks` + `task_devices` | 1분마다 디스패치 cron이 **queued 1건**을 골라 `createBatchTask()`로 **tasks 1건 + task_devices N건(기본 20)** 생성. 해당 queue 행은 `dispatched`로 변경. |
| **작업관리에서 “완료”로 보임** | `tasks.status` → `completed` / `done` | 에이전트가 **해당 task의 모든 디바이스 시청을 끝낸 뒤** `updateTaskStatus(task.id, "completed")` 호출 시점. 이 시점부터 “이미 다 시청한 영상”으로 표시됨. |

- **대기열** = “지금 재생할/재생 중인 것” (queue에 남아 있거나, queue에서 나와서 막 만든 task).
- **작업관리** = 모든 task 목록이고, 그중 **완료된 것**이 “이미 다 시청한 영상”입니다.

---

## 4. 요약

1. **몇 대**: 기본 **20대** (한 영상당 task 1개 + task_devices 20행).
2. **한 대 먼저 끝나면**: 그 대만 `task_devices` 완료 → `tasks.devices_done`만 증가. task 전체 완료는 **모든 대가 끝난 뒤** 에이전트가 한 번 `completed`로 올릴 때.
3. **대기열**: `task_queue` — 재생 대기(queued) + 디스패치로 넘어간 “재생할/재생 중” 작업.
4. **작업관리**: `tasks` — 전체 작업 목록. 그중 `status = completed/done`인 것이 “이미 다 시청한 영상”.
