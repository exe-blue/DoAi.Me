# E2E 파이프라인 진단 & 수정

## 문제 상황
- videos 테이블에 active 영상 10개 있음 (target_views=100, completed_views=0)
- Agent가 실행 중이고 DeviceOrchestrator가 동작 중
- 하지만 Orchestrator가 계속 warmup만 반복 → 대기열 시청을 안 함
- 즉, **VideoDispatcher → job_assignments → Orchestrator claim → 시청** 파이프라인이 끊겨 있음

## 진단 Step (Supabase MCP로 실행)

### Step 1: job_assignments에 pending이 있는지 확인

```sql
SELECT 
    ja.id,
    ja.pc_id,
    ja.video_id,
    ja.device_serial,
    ja.status,
    ja.created_at
FROM job_assignments ja
WHERE ja.status = 'pending'
ORDER BY ja.created_at DESC
LIMIT 20;
```

**예상 결과:**
- 행이 있으면 → Orchestrator의 claim이 실패하는 것 (Step 3으로)
- 행이 없으면 → VideoDispatcher가 assignment를 안 만드는 것 (Step 2로)

### Step 2: VideoDispatcher 진단

```sql
-- 최근 jobs 확인
SELECT id, title, video_title, keyword, target_url, is_active, created_at
FROM jobs
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC LIMIT 10;

-- 최근 job_assignments 확인 (모든 status)
SELECT 
    ja.status,
    COUNT(*) as cnt,
    MAX(ja.created_at) as latest
FROM job_assignments ja
WHERE ja.created_at > now() - interval '1 hour'
GROUP BY ja.status;
```

**분석:**
- jobs가 없으면 → VideoDispatcher가 영상을 dispatch 안 하고 있음
- jobs는 있는데 assignments가 없으면 → assignment INSERT 로직 문제
- assignments가 있는데 pc_id가 NULL이면 → 새 형식 미적용

### Step 3: claim_next_assignment 함수 테스트

PC-00의 UUID 확인 후 직접 RPC 테스트:

```sql
-- PC UUID 확인
SELECT id, pc_number FROM pcs WHERE pc_number = 'PC00';
```

그 UUID로 claim 테스트:

```sql
-- 수동으로 claim 테스트 (p_pc_id에 위의 UUID 넣기)
SELECT * FROM claim_next_assignment(
    '5da8272e-f28c-4893-b21f-c2bbe5b8c885'::uuid,
    'test_serial'
);
```

**결과:**
- 행 반환 → 함수는 정상, Orchestrator 코드 문제
- 빈 결과 → pending assignment 없거나 pc_id 불일치

### Step 4: pc_id 일치 확인

```sql
-- job_assignments의 pc_id와 pcs.id가 일치하는지
SELECT 
    ja.pc_id as assignment_pc_id,
    p.id as pcs_id,
    p.pc_number,
    ja.status,
    COUNT(*)
FROM job_assignments ja
LEFT JOIN pcs p ON ja.pc_id = p.id
GROUP BY ja.pc_id, p.id, p.pc_number, ja.status
LIMIT 20;
```

---

## 수정 (진단 결과에 따라)

### Case A: VideoDispatcher가 assignment를 아예 안 만드는 경우

video-dispatcher.js를 확인하세요. 아래 조건을 점검:

1. `videos` 테이블에서 active 영상 조회하는 쿼리가 정확한지
2. target_views > completed_views 필터가 있는지  
3. assignment INSERT 시 `pc_id`와 `video_id`가 포함되는지

**핵심: VideoDispatcher가 60초마다 실행되면서 이런 흐름이어야 함:**

```javascript
// 1. active 영상 중 아직 목표 미달인 것 조회
const { data: videos } = await supabase
    .from('videos')
    .select('*')
    .eq('status', 'active')
    .lt('completed_views', supabase.raw('target_views'));  // 또는 수동 필터

// 2. 각 영상에 대해 필요한 수만큼 assignment 생성
for (const video of videos) {
    const needed = video.target_views - video.completed_views - activeCount;
    if (needed <= 0) continue;
    
    // 3. job이 없으면 생성
    const job = await getOrCreateJob(video);
    
    // 4. assignments 생성 (device_serial = null = 가져가기 방식)
    const assignments = [];
    for (let i = 0; i < Math.min(needed, batchSize); i++) {
        assignments.push({
            job_id: job.id,
            device_id: someDefaultDeviceId, // 또는 null
            device_serial: null,            // ★ 핵심: null로!
            pc_id: this.pcId,               // ★ 핵심: UUID
            video_id: video.id,             // ★ 핵심: YouTube Video ID
            status: 'pending',
        });
    }
    await supabase.from('job_assignments').insert(assignments);
}
```

**문제 가능성:**
- `this.pcId`가 undefined → supabaseSync.pcId를 전달받지 못함
- device_id가 NOT NULL 제약 → null로 넣으면 에러
- video_id 컬럼을 사용하지 않음

### Case B: assignment가 있지만 pc_id가 NULL/불일치

```sql
-- pc_id 백필
UPDATE job_assignments
SET pc_id = '5da8272e-f28c-4893-b21f-c2bbe5b8c885'
WHERE pc_id IS NULL AND status = 'pending';
```

### Case C: assignment가 있고 pc_id도 맞는데 claim 안 되는 경우

device-orchestrator.js의 `_getNextAssignment` 확인:
- `this.pcId`가 정확한 UUID인지 (string 'PC00'이 아닌지)
- RPC 호출 시 에러 로그가 있는지

Agent 코드에서 디버그 로그 추가:

```javascript
// device-orchestrator.js의 _assignWork에서
async _assignWork(serial, state) {
    console.log(`[Orchestrator] _assignWork(${serial.substring(0,6)}) pcId=${this.pcId}`);
    
    const assignment = await this._getNextAssignment(serial);
    console.log(`[Orchestrator] claim result: ${assignment ? assignment.id.substring(0,8) : 'null'}`);
    // ...
}
```

### Case D: device_id NOT NULL 제약 문제

job_assignments.device_id가 NOT NULL이면 serial=null로 INSERT 불가:

```sql
-- device_id 제약 확인
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'job_assignments' AND column_name = 'device_id';
```

NOT NULL이면:
```sql
ALTER TABLE job_assignments ALTER COLUMN device_id DROP NOT NULL;
```

또는 VideoDispatcher에서 더미 device_id를 넣되 device_serial은 null로:
```javascript
{
    device_id: anyDeviceUUID,    // FK 만족용 (아무 디바이스)
    device_serial: null,          // Orchestrator가 채움
    pc_id: this.pcId,
    video_id: video.id,
    status: 'pending',
}
```

---

## 수정 후 검증

### 빠른 수동 테스트 (Supabase에서 직접 assignment INSERT)

```sql
-- 수동으로 pending assignment 1개 만들기
INSERT INTO job_assignments (
    job_id,
    device_id,
    device_serial,
    pc_id,
    video_id,
    status
) VALUES (
    (SELECT id FROM jobs LIMIT 1),                           -- 아무 job
    (SELECT id FROM devices LIMIT 1),                        -- 아무 device (FK용)
    null,                                                     -- Orchestrator가 채울 것
    '5da8272e-f28c-4893-b21f-c2bbe5b8c885',                  -- PC-00 UUID
    (SELECT id FROM videos WHERE status = 'active' LIMIT 1), -- 아무 active 영상
    'pending'
);
```

이걸 실행하면 3초 내에 Agent 로그에서:
```
[Orchestrator] xxx → assignment yyy
```
가 나와야 함.

안 나오면 → Orchestrator의 claim 로직에 문제
나오면 → VideoDispatcher의 INSERT 로직에 문제 (새 형식 미적용)

### 전체 파이프라인 확인 순서

```
1. 수동 INSERT → Orchestrator claim 확인 (Orchestrator 동작 검증)
2. VideoDispatcher 로그 확인 (assignment 생성 확인)
3. 자동 전체 플로우 확인 (end-to-end)
```

---

## Agent 코드 확인 요청

아래 파일의 현재 코드를 확인하고, 위 진단 결과에 맞게 수정해주세요:

1. `video-dispatcher.js` — assignment INSERT 시 pc_id, video_id, device_serial=null 포함 여부
2. `device-orchestrator.js` — _getNextAssignment에서 this.pcId가 UUID인지, RPC 호출 로직
3. `agent.js` — DeviceOrchestrator 생성 시 pcId: supabaseSync.pcId (UUID) 전달 확인

수정 후 Agent 재시작해서 로그 확인.

---

## 진단 체크리스트 결과 (코드베이스 기준)

아래는 이 문서 기준으로 현재 코드/스키마를 점검한 결과입니다.

### 1. device-orchestrator.js / claim 방식

| 항목 | 상태 | 비고 |
|------|------|------|
| device-orchestrator.js 존재 | ❌ 없음 | 문서의 "Orchestrator claim" 흐름은 미구현 |
| claim_next_assignment RPC 호출 | ❌ 없음 | Agent에 해당 RPC 호출 코드 없음 |
| _getNextAssignment, _assignWork | ❌ 없음 | DeviceOrchestrator 자체가 없음 |

**결론:** 문서가 가정하는 **"대기열(pending) → Orchestrator가 claim → 시청"** 구조가 아니라, 현재는 **TaskExecutor가 device_id로 이미 지정된 pending assignment를 폴링**하는 방식만 존재함.

---

### 2. video-dispatcher.js — assignment INSERT 형식

| 항목 | 문서 기대 | 현재 코드 | 상태 |
|------|-----------|-----------|------|
| assignment에 pc_id 포함 | ✅ pc_id (UUID) | ❌ INSERT 시 pc_id 없음 | ❌ 불일치 |
| assignment에 video_id 포함 | ✅ video_id | ❌ INSERT 시 video_id 없음 | ❌ 불일치 |
| device_serial | null (가져가기 방식) | device_serial: d.serial_number (미리 지정) | ❌ 상이 |
| target_views > completed_views 필터 | videos 테이블 기준 | 고정 targetViewsDefault=100, job_assignments completed 개수로만 판단 | ⚠️ videos 컬럼 미사용 |

**현재 INSERT 필드:** `job_id`, `device_id`, `device_serial`, `status`, `progress_pct`  
**문서 권장:** `job_id`, `device_id`(또는 null), `device_serial: null`, `pc_id`, `video_id`, `status`

---

### 3. agent.js — DeviceOrchestrator / pcId 전달

| 항목 | 상태 | 비고 |
|------|------|------|
| DeviceOrchestrator 생성 및 pcId 전달 | ❌ 해당 없음 | DeviceOrchestrator 미사용 |
| VideoDispatcher 생성 시 pcId | ✅ 전달됨 | `new VideoDispatcher(supabaseSync, config, broadcaster)` → supabaseSync.pcId 사용 |
| supabaseSync.pcId가 UUID인지 | ✅ 예 | getPcId(pcNumber)가 pcs.id (UUID) 반환 |

---

### 4. DB 스키마 (마이그레이션 vs 코드 가정)

| 항목 | 마이그레이션(00001, 00002 등) | 코드에서 사용 | 상태 |
|------|------------------------------|---------------|------|
| pcs 테이블 | ❌ 없음 (workers 있음) | supabase-sync, video-dispatcher, task-executor 사용 | ⚠️ 스키마 드리프트 |
| devices.pc_id | ❌ 없음 (worker_id 있음) | .eq("pc_id", this.pcId) | ⚠️ 스키마 드리프트 |
| devices.serial_number | ❌ 없음 (serial 있음) | .select("id, serial_number") | ⚠️ 스키마 드리프트 |
| jobs 테이블 | ❌ 없음 | video-dispatcher, task-executor 사용 | ⚠️ 마이그레이션 없음 |
| job_assignments 테이블 | ❌ 없음 | video-dispatcher, task-executor 사용 | ⚠️ 마이그레이션 없음 |
| videos.target_views / completed_views | ❌ 없음 (00002) | 문서만 언급 | ⚠️ 문서 기준이면 스키마 추가 필요 |
| videos.duration_sec | ❌ 없음 (00002는 duration_seconds) | video-dispatcher select duration_sec | ⚠️ 컬럼명 불일치 가능 |

---

### 5. TaskExecutor — job_assignments 소비 방식

| 항목 | 상태 | 비고 |
|------|------|------|
| pending 조회 시 pc_id 사용 | ❌ 사용 안 함 | device_id IN (이 PC의 devices) 로만 조회 |
| device_serial null 처리 | ✅ 있음 | null이면 failed 처리 (에러 로그) |
| claim_next_assignment RPC | ❌ 미사용 | 직접 SELECT로 pending 가져옴 |

---

### 6. 요약 — “안 되는 부분” 체크

1. **Orchestrator/claim 파이프라인 미구현**  
   문서의 Step 3(claim_next_assignment), Step 4(pc_id 일치), Case C(device-orchestrator.js)는 **현재 코드베이스에 해당 컴포넌트가 없음**.

2. **VideoDispatcher가 문서와 다른 형식으로 INSERT**  
   `pc_id`, `video_id` 미포함, `device_serial`을 null이 아닌 값으로 지정 → 문서의 “가져가기 방식”과 불일치.

3. **스키마와 코드 불일치**  
   `pcs`, `jobs`, `job_assignments`, `devices.pc_id`, `devices.serial_number` 등이 마이그레이션에는 없고, 실제 DB는 별도 적용/수동 생성된 것으로 보임. `videos`는 `target_views`/`completed_views`/`duration_sec` 등 문서·코드 가정이 마이그레이션과 다름.

4. **진단 문서의 SQL/Step은 유효**  
   실제 DB에 `pcs`, `jobs`, `job_assignments`가 있다면 문서의 Step 1~4, Case A~D는 그대로 따라 진단 가능. “안 되는 부분”은 **코드가 문서에서 기대하는 스키마·플로우를 따르지 않는 것**으로 정리됨.

---

### 7. 수정 시 권장 방향

- **문서의 “가져가기 + claim” 방식을 따르려면:**  
  - `claim_next_assignment(p_pc_id, serial)` RPC 구현 및 마이그레이션 추가.  
  - `device-orchestrator.js` 신규 작성 (또는 TaskExecutor를 claim 기반으로 변경).  
  - VideoDispatcher에서 assignment INSERT 시 `pc_id`, `video_id` 포함, `device_serial: null` 로 생성.

- **현재 “디바이스 미리 지정” 방식을 유지하려면:**  
  - 문서를 현재 동작에 맞게 수정 (claim 단계 제거, assignment 형식·진단 Step을 현재 코드/스키마에 맞게 정리).