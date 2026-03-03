# Desktop 실행 우선 복구 — 변경 요약

**기준**: fix/restore (4ea8c45). Agent SSOT = `apps/desktop/src/agent` (dev) / `resources/agent` (dist).

---

## 1. SSOT 경로가 하나로 고정된 변경 요약

- **유일 실행 경로**
  - **Dev**: `app.getAppPath()` → `path.join(repoRoot, "src", "agent", "agent.js")`, cwd `path.join(repoRoot, "src", "agent")`.  
    즉 `apps/desktop/src/agent/agent.js` 만 사용.
  - **Dist**: `process.resourcesPath/agent/agent.js`, cwd `process.resourcesPath/agent`, node `process.resourcesPath/node/node.exe`.  
    `extraResources`로 `src/agent` → `agent` 복사.
- **제거/금지**
  - `packages/agent`, 루트 `agent/` 는 spawn 대상이 아님.  
  - `agentRunner.ts` 에서 위 두 경로만 사용하며, `packages/agent` 또는 `repoRoot/../packages/agent` 등 다른 경로 탐색/분기는 없음.
- **코드 변경**
  - `apps/desktop/src/main/agentRunner.ts`: 주석을 "SSOT paths only (no packages/agent or root agent/)" 로 명시, Dev/Dist 경로 설명 정리.  
  - 기존 구현이 이미 Dev = `src/agent`, Dist = `resources/agent` 만 사용하고 있어, **추가로 제거한 경로 분기 없음** — SSOT 문구로 고정만 명확히 함.

---

## 2. Env 전달 방식 요약 (Desktop → Agent)

- **Desktop main**
  - 앱 진입 시 dotenv 로드:  
    `process.resourcesPath/.env` (패키징 시) → `process.cwd()/.env.local` → `.env.prod` → `.env`.
  - `getAgentEnv()`: `process.env` 에서 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `XIAOWEI_WS_URL` 만 골라 객체로 반환.
- **Spawn 시**
  - `agentRunner.startAgent(getAgentEnv())` 호출.  
  - `buildAgentEnv(overrides)`: `process.env` 를 베이스로 하고, `overrides` 의 위 키들을 덮어씀.  
  - `child = spawn(paths.node, args, { ..., env: buildAgentEnv(envOverrides) })` 로 **명시적 env** 전달.
- **Agent**
  - config 는 `process.env` 우선 사용 (spawn 시 이미 설정됨).  
  - dotenv 는 `config.js` 에서 `.env` 만 `override: false` 로 보조 로드.  
  - 시작 시 한 줄 로그: `[Agent] using ws_url=... supabase_host=...`

---

## 3. 실행 단계별 로그 예시 (연결 / claim / run)

- **WebSocket**
  - `[Xiaowei] connect_attempt url=ws://127.0.0.1:22222/`
  - 성공: `[Xiaowei] connect_success`
  - 실패: `[Xiaowei] connect_failed error=...` 또는 `connect_failed close_before_open`
- **Claim**
  - `[DeviceOrchestrator] claim_start pc_id=PC-01`
  - `[DeviceOrchestrator] claim_result count=1 task_device_ids=["<uuid>"]` (또는 `count=0 task_device_ids=[]`)
- **Run**
  - `[DeviceOrchestrator] run_start task_device_id=<uuid>`
  - 성공: `[DeviceOrchestrator] run_end status=completed task_device_id=<uuid>`
  - 실패: `[DeviceOrchestrator] run_end status=failed task_device_id=<uuid> error_code=<message>`

---

## 4. 로그인 화면 동작 요약

- **첫 화면**
  - 앱 로드 시 Supabase 설정을 main 에서 `getSupabaseConfig` 로 받아, renderer 에서 `createClient(url, anonKey)` 로 **anon 전용** 클라이언트 생성.
  - `auth.getSession()` 으로 세션 확인. **세션 없으면** 로그인 화면(LoginView)만 표시.
- **LoginView**
  - 이메일/비밀번호 입력 → `supabase.auth.signInWithPassword({ email, password })` (동일 anon 클라이언트).
  - 성공 시 세션 저장(클라이언트 기본 동작), `onAuthStateChange` 로 App 의 session 상태 갱신 → **Status Board 등 메인 탭으로 전환**.
- **권한**
  - Renderer 는 **anon key + session 만** 사용. 서비스 롤/비공개 키는 사용하지 않음.
  - 데이터/명령은 Supabase(Realtime, RPC, 테이블) 경로만 사용.

---

## 5. 검증 루프 (실행 후 확인 권장)

1. **Desktop dev 실행**  
   `cd apps/desktop && pnpm run dev` → Agent 자동 기동 → agent 로그에 `connect_success` 확인.
2. **Supabase**  
   PC 등록(pcs 테이블), `.env` 의 SUPABASE_URL/SUPABASE_ANON_KEY 적용 여부 확인.
3. **task_devices**  
   한 건이라도 `claim_result count=1` 후 `run_start` → `run_end status=completed` 또는 `failed` 까지 로그로 확인.
4. **실패 시**  
   위 로그 순서(connect_attempt → claim_start → claim_result → run_start → run_end)로 **어느 단계에서 끊겼는지** 판단.
