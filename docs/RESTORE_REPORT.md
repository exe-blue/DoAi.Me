# Desktop/Agent 복구 보고서

**목표**: 기능 추가 없이 "정상 동작 기준점" 복구.  
**작업일**: 2026-03-03.

---

## 1. 현재 상태 보존

- **브랜치**: `wip/broken-snapshot`
- **커밋**: `wip: broken snapshot - desktop/agent/docs mixed state (no new features)`
- 빌드 성공 여부와 무관하게 꼬인 상태 전체가 이 브랜치에 커밋되어 있음. 필요 시 `git checkout wip/broken-snapshot`으로 복귀 가능.

---

## 2. 정상 커밋 후보 3개

| 순위 | 커밋 | 제목 | 되돌렸을 때 예상 영향 |
|------|------|------|------------------------|
| **1** | `4ea8c45` | fix(desktop): gate agent restart on Xiaowei readiness | Agent 경로: **Dev** = `apps/desktop/src/agent/agent.js`, **Dist** = `resources/agent` (from `src/agent`). packages/agent 없음. Xiaowei 준비 후에만 agent 재시작. 이후 커밋(동적 config, 문서 등) 모두 제거됨. |
| **2** | `e3dd6a6` | fix(desktop): hostname-based PC registration, Xiaowei-gated device poll | 4ea8c45 이전. PC_NUMBER 제거, hostname 기반 등록, device poll 시 Xiaowei 도달 확인. main.ts/agent 구조는 4ea8c45와 동일 계열. |
| **3** | `740e99f` | feat(desktop): add dashboard components, stores; fix pipeline & dequeue | 대규모 main.ts/AlertPanel/LogPanel/스토어 추가. Agent는 여전히 `apps/desktop/src/agent`. CI 백업 등으로 워크플로 변경 있음. |

**권장**: **1번 `4ea8c45`**를 기준으로 복구.  
이후에 추가된 “동적 config 관리자”(611727f), `packages/agent`로의 이전, 문서/복붙으로 인한 혼선을 제거한 상태.

---

## 3. 복구 브랜치 및 최소 변경

- **브랜치**: `fix/restore`
- **기준 커밋**: `4ea8c45`
- **복구 브랜치에서 적용한 최소 변경 목록**: **없음**.  
  해당 브랜치는 “정상으로 판단한 시점” 그대로이므로, 추가 수정 없이 사용.

필요 시 로컬에서만:
- 루트 또는 `apps/desktop`에 `.env` / `.env.local` / `.env.prod` 설정(SUPABASE_URL, SUPABASE_ANON_KEY, 필요 시 XIAOWEI_WS_URL).
- 패키징 시: 이후 main에서 쓰는 `copy-env-to-agent.js` / `.env.prod` → `resources/.env` 복사가 4ea8c45에는 없을 수 있으므로, 배포 시 env 전달 방식 확인.

---

## 4. 재현/검증 명령어

```powershell
# 1) 복구 브랜치로 이동
cd c:\Users\choi\doai.me\DoAi.Me
git checkout fix/restore

# 2) 의존성 (desktop만)
pnpm install
cd apps/desktop && pnpm install

# 3) Desktop 빌드 및 실행
cd apps/desktop
pnpm run build
pnpm run dev

# 4) 웹소켓 연결 확인
# - Xiaowei 도구가 ws://127.0.0.1:22222 에서 동작 중이어야 함.
# - Desktop UI에서 Agent 로그(userData/logs/agent-stdout.log)에 "[Agent] ✓ Xiaowei connected" 확인.

# 5) task_devices claim → runTaskDevice 최소 1회
# - 대시보드에서 해당 PC에 task 생성 후, agent 로그에 claim/runTaskDevice 관련 로그가 찍히는지 확인.
# - 또는 Supabase task_devices 테이블에서 status 전이 확인.
```

**실패 시 좁혀볼 곳**  
- **Agent 미기동**: `getAgentPaths()` 실패 → `apps/desktop/src/agent/agent.js` 존재 여부, `app.getAppPath()`가 `apps/desktop`을 가리키는지.  
- **웹소켓 실패**: Xiaowei 프로세스 실행 여부, 방화벽, `XIAOWEI_WS_URL`(기본 `ws://127.0.0.1:22222/`).  
- **명령 미실행**: Supabase env(SUPABASE_URL, SUPABASE_ANON_KEY), PC 등록(hostname → pcs 테이블), task_devices RPC 권한.

---

## 5. 원인 분류 (요약)

- **왜 웹소켓/명령이 안 됐는지**  
  - **경로 분산**: agent 코드가 루트 `agent/`, `apps/desktop/src/agent/`, 이후 `packages/agent/`로 나뉘고, agentRunner는 시점에 따라 `repoRoot/src/agent` vs `packages/agent`를 참조. 한쪽만 수정되면 “실제 실행되는 쪽”과 불일치 가능.  
  - **env 로딩 위치**: Desktop main은 `process.cwd()` 기준 `.env*` 로드. Agent는 자체 config에서 `__dirname` 기준 경로로 dotenv 로드. 패키징 시 cwd/resources 경로가 달라지면 env가 agent에 전달되지 않을 수 있음.  
  - **동적 config(611727f)**: packages/agent의 config가 Realtime 구독 등으로 바뀌면서, agent 진입점이 packages/agent로 옮겨진 상태와 맞지 않거나, 의존성/경로가 꼬였을 가능성.  
  - **복붙/롤백**: web/desktop/agent/docs를 여러 번 삭제·복붙·롤백하면서, “어디가 단일 소스인지” 무너짐.  
- **문제였을 가능성 있는 파일**  
  - `apps/desktop/src/main/agentRunner.ts` (dev 경로: `repoRoot/src/agent` vs `packages/agent` 전환).  
  - `packages/agent/config.js` (동적 설정, env 경로).  
  - `apps/desktop/package.json` (extraResources: `src/agent` vs `../../packages/agent`).  
  - 루트/desktop의 중복 agent 디렉터리들.

---

## 6. 재발 방지

- **env 및 작업 규칙**: `docs/ENV_AND_WORK_RULES.md` 참고.  
- **복붙 금지**: agent/docs 등은 한 곳을 SSOT로 두고, 작은 PR/커밋·worktree 활용으로 변경. 대량 이동/복붙은 하지 않음.
