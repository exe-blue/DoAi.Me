# AgentRunner 체크리스트 (PM2 없이 운영)

Electron main이 agent 프로세스를 spawn하고 감시한다. PM2는 사용하지 않는다.

---

## PM2 없이 운영 가능한 이유 요약

- **단일 프로세스 트리**: Desktop( Electron )이 agent를 자식 프로세스로 spawn하므로, 부모가 죽으면 자식도 정리된다. PM2처럼 별도 데몬이 필요 없다.
- **재시작/백오프**: exit 시 exit code·횟수에 따라 backoff(2s → 5s → 10s) 후 재시작, 최대 5회까지 시도 후 ERROR 상태로 전환. PM2의 restart delay / max_restarts에 해당.
- **Readiness gate**: Xiaowei(WS 22222) 도달 여부를 main이 WS precheck로 확인하고, 준비될 때까지 agent 재시작을 유예한다. PM2의 wait_ready / listen_timeout 개념을 main 쪽에서 처리.
- **로그 분리**: stdout/stderr를 각각 `userData/logs/agent-stdout.log`, `agent-stderr.log`에 append. PM2의 out/err 로그 파일과 동일한 역할.
- **Dist 단일 번들**: agent는 `scripts/bundle-agent.js`로 단일 CJS 번들(`agent.bundle.cjs`)에 의존성이 인라인되므로, dist에 node_modules나 PM2가 필요 없다.

---

## AgentRunner 체크리스트

| 항목 | 구현 내용 |
|------|-----------|
| **Exit code / 횟수** | `child.on("exit", (code, signal))` → state에 `lastExitCode`, 재시작 시 `restartCount` 증가. `MAX_RESTARTS`(5) 초과 시 `status: "ERROR"`로 전환. |
| **Backoff** | `BACKOFF_MS = [2000, 5000, 10000]`. `getBackoffMs()`로 `restartCount`에 따라 지연 선택. 재시작 타이머에서 해당 ms 후 `startAgent(lastEnvOverrides)` 호출. |
| **Readiness (WS 22222)** | `setXiaoweiReadyCheck(fn)`: main이 `state.adbHealthy`(WS precheck 결과)를 전달. 재시작 시 `xiaoweiReadyCheck()`가 false면 3초 간격 폴링 후 true일 때만 spawn. **HTTP 22600은 readiness에 사용하지 않음** (명령 전송용으로만 사용 가능). |
| **WS 22222** | 디바이스 목록·adb 명령 등은 `XIAOWEI_WS_URL`(기본 222222)로 HTTP 호출. Readiness 판단은 **WS 22222만** 사용. 22600은 옵션(env로 변경 가능). |
| **로그 파일 분리** | `ensureLogStreams()`: `userData/logs/agent-stdout.log`, `agent-stderr.log`에 append. `getAgentLogPaths()`로 경로 반환. |
| **Open logs folder** | 앱 메뉴 또는 IPC로 `shell.openPath(getAgentLogDir())` 호출 → 로그 폴더 열기. |

---

## Dist에서 agent가 죽지 않게 (MODULE_NOT_FOUND 방지)

- **단일 번들**: `scripts/bundle-agent.js`가 `src/agent/agent.js`를 entry로 esbuild로 번들. `ws`, `dotenv`, `@supabase/supabase-js`, `winston`, `cron-parser` 등은 **external 하지 않고** 모두 번들에 포함.
- **실행 경로**: Dist에서는 `process.resourcesPath/agent/agent.bundle.cjs`만 실행. cwd는 `resources/agent`(여기 있는 `.env` 사용).
- **Node 실행 파일**: `resources/node/node.exe`(download-node-win 등으로 준비)로 위 번들을 실행하므로, 시스템 Node나 agent용 node_modules가 필요 없다.
- **빌드 순서**: `pnpm run dist` 시 `bundle-agent.js` → `agent-dist/agent.bundle.cjs` 생성 → electron-builder의 extraResources가 `agent-dist` → `resources/agent`로 복사.

**MODULE_NOT_FOUND 검증**: 로컬에서 `node apps/desktop/agent-dist/agent.bundle.cjs` (필요 시 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 등 env 설정)로 실행해 보면, 번들만으로 기동되는지 확인할 수 있다. 실패 시 `scripts/bundle-agent.js`의 `external: []` 유지 여부와 desktop `node_modules`에 `ws` 등 의존성 설치 여부를 확인한다.

---

## Packaged env (resources/.env)

- **소스**: `pnpm run prepare:packaged-env`가 `.env.prod`(desktop), `.env.local`/`.env`(root·desktop)를 읽어 `release.env`를 생성.
- **설치본**: electron-builder `extraResources`가 `release.env`를 `resources/.env`와 `resources/agent/.env`로 복사.
- **로드 순서**: main은 packaged 시 **1) resources/.env, 2) resources/agent/.env** 만 dotenv로 로드(desktop.log에 성공/실패 기록). Agent는 spawn 시 전달된 env 사용(config.js는 dotenv override: false).
- **검증**: 설치본 실행 후 desktop.log에 `resources/.env loaded`, `agent/.env loaded` 및 `[Main] Agent env (masked): SUPABASE_URL host=…` 확인. agent.stderr.log에 `[Agent] ✓ Supabase connected` 및 pcs.last_heartbeat 갱신·preset 조회 동작 확인.
