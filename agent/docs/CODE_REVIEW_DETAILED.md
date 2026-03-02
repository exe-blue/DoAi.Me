# Agent 상세 코드 리뷰 (DoAi.Me 규칙 + 검색 실패 원인 + 의존성/경로)

**SSOT:** 실행 단위는 **task_devices**. job_assignments/jobs는 레거시 참고용.

## 규칙 준수 체크 (code-review-doai)

- **Backend**: Agent 영역 — 해당 없음. (API는 `app/api/` 기준 유지)
- **DB**: task_devices, tasks, devices, pcs 사용. migration 경로는 `supabase/migrations/` (프로젝트 루트). job_assignments/jobs는 레거시.
- **Agent**: Xiaowei WebSocket만 사용, uiautomator2 미사용 ✅
- **Docs**: ENV.md에 Agent 변수 있으나 **이름 불일치** (아래 Critical)
- **Banned**: FastAPI/Celery/Redis/uiautomator2 없음. SUPABASE_SERVICE_ROLE_KEY는 Agent 서버 측만 사용(노출 금지 준수).

---

## Critical (반드시 수정)

### 1. **[원인 확정] 검색/영상 못 찾는 이유 — Xiaowei 응답에서 dump 문자열을 안 가져옴**

**원인:**  
Xiaowei `adb_shell` 응답이 **디바이스별로** `{ data: { [serial]: "stdout..." } }` 형태인데, `task-executor.js`의 `_extractShellOutput(res)`는 `res.data`가 객체일 때 **`String(res.data)`** 만 해서 `"[object Object]"`가 됨.  
→ UI dump XML 전체가 아니라 `"[object Object]"`에 대해 regex를 돌리므로 **검색 아이콘/검색창/첫 결과 패턴이 절대 매칭되지 않음.**  
→ 그래서 "search icon NOT found", "search bar NOT found", "First video result not found"가 나고, 검색을 못 하고 영상을 못 찾는 것처럼 보임.

**수정 내용 (이미 반영):**  
- `_extractShellOutput(res, serial)` 로 두 번째 인자 `serial` 추가.  
- `res.data`가 객체일 때: `serial`이 있으면 `res.data[serial]`, 없으면 `Object.values(res.data)[0]` 로 **실제 stdout 문자열**을 사용.  
- `_findAndTapSearch`, `_findAndTapSearchBar`, `_findAndTapFirstResult`, `_searchAndSelectVideo`(focus), `_inputText`, `_trySkipAd`, `_ensurePlaying` 에서 `_extractShellOutput(..., serial)` 호출하도록 변경.

**검증:**  
Agent 재시작 후 같은 기기에서 검색 플로우 실행 → `search icon at (x,y)`, `search bar at (x,y)`, `video result at (x,y)` 로그가 나오는지 확인.

---

### 2. **ENV/문서와 코드 불일치 — PC 식별자**

- **코드:** `config.js`는 `process.env.PC_NUMBER` (기본값 `"PC00"`), `supabase-sync.js`는 `pcs.pc_number` 로 등록.
- **docs/ENV.md:** Agent 필수 변수로 `WORKER_NAME`(예: `node-pc-01`) 기재.
- **agent/.env.example:** `WORKER_NAME=node-pc-01` 있음.  
→ 실제 동작은 `PC_NUMBER`인데 문서/예시는 `WORKER_NAME`이라, 새로 세팅 시 Agent가 잘못된 식별자로 동작하거나 등록 실패할 수 있음.

**권장:**  
- ENV.md와 .env.example을 **PC_NUMBER** 기준으로 통일 (필수: `PC_NUMBER=PC00` 형식).  
- `WORKER_NAME`이 레거시라면 문서에서 제거하거나 “PC_NUMBER로 대체됨” 명시.

---

### 3. **VideoDispatcher — jobs insert 시 `video_title` 미설정**

- `video-dispatcher.js`에서 job insert 시 `title: "Auto: ${video.title}"` 만 넣고, **`video_title` 컬럼은 설정하지 않음.**
- `task-executor.js`는 `videoTitle = job.video_title || job.title` 로 검색어를 만듦.  
→ 현재는 `job.title`만 있어도 동작하지만, DB/다른 코드에서 `job.video_title`을 기대하면 null로 나옴.

**권장:**  
Job insert 시 `video_title: video.title` (또는 동일한 값) 추가해 두면, 검색어·표시·통계 일관성에 유리함.

---

## Suggestion (규칙·일관성 정리)

### 4. **claim_next_task_device / task_devices — device_serial 일관성**

- DeviceOrchestrator는 `claim_task_devices_for_pc` 또는 `claim_next_task_device(p_worker_id, p_device_serial)` 사용. task_devices 행의 device_serial이 실제 실행 기기와 일치하는지 확인.

---

### 5. **DeviceOrchestrator — runTaskDevice**

- DeviceOrchestrator는 `taskExecutor.runTaskDevice(taskDevice)` 호출 (task_devices 한 행). TaskExecutor에 runTaskDevice 구현됨.  
---

### 6. **UI dump 실패 시 관찰 가능성**

- 검색/결과 선택 실패 시 **어떤 XML이 들어왔는지** 로그가 없어, YouTube 버전/리소스 변경 시 원인 추적이 어려움.

**권장:**  
- `_findAndTapSearch` / `_findAndTapSearchBar` / `_findAndTapFirstResult` 에서 **매칭 실패 시** `xml.substring(0, 500)` 또는 bounds가 포함된 일부만 `console.warn`으로 출력 (개인정보/과도한 로그 주의).  
- 필요 시 패턴을 넓히거나, 속성 순서가 다른 경우를 위한 regex 추가.

---

### 7. **에러 삼키기 (silent catch)**

- VideoDispatcher, DeviceOrchestrator 등에서 `catch { return false; }` / `return 0` 만 하고 로그 없음.  
- DB/네트워크 일시 오류 시 “pending 없음”으로 잘못 판단해 free_watch로 빠질 수 있음.

**권장:**  
최소한 `console.warn('[Module] operation failed', err.message)` 수준 로그 추가.  
중요 경로(claim, pending 여부)는 재시도 또는 상위 전파 검토.

---

## Nice to have (정리·가독성)

### 8. **경로·의존성**

- **SCRIPTS_DIR:** `config.scriptsDir`이 빈 문자열이면 `path.join("", scriptPath)` → 상대 경로.  
  - 작업 디렉터리(cwd)에 따라 스크립트를 못 찾을 수 있음.  
  - **권장:** Agent 실행 시 cwd를 `agent/` 또는 스크립트 루트로 고정하거나, `SCRIPTS_DIR`을 절대 경로로 두고 문서에 명시.
- **CONFIG_DIR:** 사용처가 제한적이면 ENV.md에 “선택, 용도: …” 정도만 적어 두면 됨.
- **의존성:** `device-presets.js`의 `extractValue(res, serial)` 과 `task-executor.js`의 `_extractShellOutput(res, serial)` 이 같은 “Xiaowei 응답에서 해당 기기 stdout 추출” 역할.  
  - 공통 유틸로 빼면 응답 형식 변경 시 한 곳만 수정 가능.

### 9. **Agent 시작 단계 번호**

- `agent.js` main()에서 단계 번호가 5, 5a, 6, … 15, 15b, 13a, 16 처럼 순서와 안 맞음.  
- **권장:** Phase(1: 연결, 2: Xiaowei/디바이스, 3: 폴링/구독)로 묶고, README/ARCHITECTURE에 “Agent startup sequence” 요약 추가.

### 10. **sleep / 로거**

- `sleep`/`_sleep` 이 여러 파일에 중복.  
- 로그에 타임스탬프·레벨 없음.  
- **권장:** 공통 `sleep`, 구조화 로그(레벨·모듈·메시지) 도입 시 운영 시 추적이 쉬워짐.

---

## 요약 표

| 구분 | 항목 | 심각도 | 조치 |
|------|------|--------|------|
| **Critical** | Xiaowei 응답 `data[serial]` 미추출 → 검색/영상 못 찾음 | 높음 | ✅ `_extractShellOutput(res, serial)` 및 모든 호출부에 serial 전달 반영 |
| **Critical** | ENV: WORKER_NAME vs PC_NUMBER 불일치 | 중 | ENV.md·.env.example을 PC_NUMBER 기준으로 통일 |
| **Critical** | jobs.video_title 미설정 | 낮음 | VideoDispatcher job insert 시 video_title 설정 권장 |
| **Suggestion** | claim 2인자 → device_id 불일치 가능 | 중 | 3인자 RPC 또는 device_id 갱신 검토 |
| **Suggestion** | runAssignment 미구현 분기 | 낮음 | 구현 추가 또는 분기 제거 |
| **Suggestion** | UI dump 실패 시 로그 없음 | 낮음 | 실패 시 xml 일부 로그 |
| **Suggestion** | silent catch 다수 | 중 | 최소 warn 로그 추가 |
| **Nice to have** | SCRIPTS_DIR/cwd, extractValue 통합, 시작 단계 정리, sleep/로거 | 낮음 | 문서화 및 점진적 정리 |

---

## 참고

- `.cursor/rules/project-conventions.mdc`
- `ARCHITECTURE.md`, `docs/FOLDER_STRUCTURE.md`, `docs/ENV.md`
- `agent/docs/AGENT_CRITICAL_REVIEW.md` (이전 비판적 리뷰)
