# Agent `src/` 디렉터리 현황

정리일: 2026-02-25 (Repo Cleanup)

## 요약

- **프로덕션 엔트리포인트:** `agent/agent.js` (CommonJS). 실제 실행은 `node agent/agent.js` 또는 `npm run agent:start`.
- **`agent/src/`:** TypeScript 마이그레이션 잔재. 현재 프로덕션에서 사용하지 않음. 삭제하지 않고 보존.
- **추후 검토:** 필요 시 `agent/src`를 `_archive` 등으로 이동하는 정리를 별도 진행할 수 있음.

## 참고

- Agent 모듈 구조·레이어: `docs/agent-js-modules-and-layers.md`
- 레거시/아카이브 파일 설명: `docs/agent-legacy-files-explained.md`
