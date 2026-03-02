# Agent Legacy / Unused Code Archive

이 폴더는 **현재 프로세스**(`agent/agent.js` 진입점)에서 **사용하지 않는** agent 관련 JS 파일·폴더를 보관한 곳입니다.

- **기준**: `agent.js`에서 직접·간접 `require()` 되는 모듈만 "사용 중"으로 간주.
- **이동일**: 2026-02-28. 필요 시 복원 가능.

## 보관 구조

| 경로 | 설명 |
|------|------|
| `scripts/` | 단독 실행 스크립트·패치·barrel index (stress-test-loop, run-optimize, patch-agent, script-cache, ecosystem.config 등) |
| `task-unused/` | task 레이어 미사용 (index, command-executor, command-poller, task-state-machine) |
| `device-unused/` | device 레이어 미사용 (models, service, index) |
| `youtube/` | YouTube 플로우 모듈 전체 (flows, verify, watch, search, action, preflight, selectors, warmup 등) — task-executor는 인라인 + AutoJS 사용 |
| `dashboard/` | 대시보드 서비스 (agent.js에서 미참조) |
| `proxy/` | proxy 테이블·서비스 (proxy-manager는 별도 구현) |
| `account/` | account 테이블·서비스 (account-manager는 별도 구현) |
| `adb/` | ADB 클라이언트·xml-parser·screen·helpers (youtube/ 및 device/service에서만 사용) |
| `common/` | logger, errors, retry, config (위 레거시 모듈에서만 사용) |
| `video-manager/` | 비디오·채널 모델·서비스 (agent.js에서 미참조) |

## 현재 프로세스에서 사용 중인 agent 파일 (18개)

- `agent.js`, `config.js`
- `core/`: xiaowei-client.js, supabase-sync.js, dashboard-broadcaster.js
- `device/`: heartbeat.js, adb-reconnect.js, device-watchdog.js, device-orchestrator.js, device-presets.js
- `task/`: task-executor.js, stale-task-cleaner.js
- `scheduling/`: queue-dispatcher.js, schedule-evaluator.js
- `setup/`: proxy-manager.js, account-manager.js, script-verifier.js, comment-generator.js

상세 매핑은 `docs/agent-js-modules-and-layers.md` 참고.
