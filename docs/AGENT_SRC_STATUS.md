# Agent 실행 경로 현황 (SSOT)

정리일: 2026-03 (실행 보장 플랜 반영)

## 요약

- **실행 SSOT:** `apps/desktop/src/agent`. Desktop 앱이 Agent를 스폰할 때 사용하는 코드는 이 디렉터리만 사용한다. 루트 `agent/`는 실행 경로가 아니다.
- **Dev:** `apps/desktop/src/agent/agent.js`. 실행은 Desktop 메인 프로세스가 `agentRunner.startAgent()`로 `node` + `agent.js`를 cwd=`apps/desktop/src/agent`로 스폰. 단독 실행: `pnpm run agent:run` (apps/desktop에서 `node src/agent/agent.js`).
- **Dist(패키징 후):** `process.resourcesPath/agent/agent.bundle.cjs` 우선, 없으면 `agent.js`. cwd=`resources/agent`, nodePath=`resources/node/node.exe`. extraResources로 `agent-dist/` → `agent/`, `node-bundle/` → `node` 복사.
- **루트 `agent/`:** 레거시/참고용. 실행 경로로 사용하지 않음. 이관된 코드는 `apps/desktop/src/agent` 또는 `_archive/agent-legacy` 참고.
- **`agent/src/`:** TypeScript 마이그레이션 잔재. 현재 실행과 무관. 삭제하지 않고 보존.

## 검증

- Dev: `pnpm run dev` 후 desktop.log에 `[AgentRunner] Dev ... scriptExists=true` 및 자식 프로세스로 node가 agent.js 실행 중인지 확인.
- Dev 단독: `pnpm run agent:run` 시 agent.js가 모듈 로드 후 Supabase/Xiaowei 연결 시도까지 진행하는지 확인.
- Dist: 설치본 실행 후 process가 agent.bundle.cjs(또는 agent.js) 실행 중인지, userData 하위 agent-ws-status.json, agent-devices.json 생성·갱신 여부 확인.

## 참고

- Agent 모듈 구조·레이어: `docs/agent-js-modules-and-layers.md`
- 디바이스 레이어 ↔ JS: `docs/agent-device-layer-js-mapping.md`
- 기동 후 자동화·Supabase 연동: `docs/agent-automation-and-supabase.md`
- 레거시/아카이브 파일: `docs/agent-legacy-files-explained.md`
