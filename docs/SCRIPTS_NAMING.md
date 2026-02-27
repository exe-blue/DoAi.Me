# 스크립트 네이밍 규칙 (DB + API + UI 강제)

## 규칙 요약

- **형식**: 슬래시 경로, **2세그먼트 이상** (예: `yt/preflight`, `device/adb/restart`).
- **문자**: 소문자, 숫자, `_`, `-` 만. 첫 글자는 소문자 또는 숫자.
- **prefix allowlist**: 최상위 디렉터리는 **yt**, **device**, **ops** 만 허용.
- **유니크**: `scripts.name` 은 테이블 전체에서 유일.

## DB 레벨 (마이그레이션)

- `scripts_name_unique`: `name` UNIQUE.
- `scripts_name_path_check`: 정규식 `^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$`.
- `scripts_name_prefix_allowlist`: `name LIKE 'yt/%' OR name LIKE 'device/%' OR name LIKE 'ops/%'`.

거부 예: `misc/test`, `YT/preflight`, `yt//watch`, `yt/`.

## API 레벨

- `lib/validate-script-name.ts`: `validateScriptName(name)` → 사전 검증.
- **POST /api/scripts**, **PATCH /api/scripts/[id]** (name 변경 시): 검증 실패 시 400 + 친절한 메시지.

## UI 레벨

- 새 스크립트 폼: prefix 드롭다운(yt, device, ops) + 경로 입력 → `name = ${prefix}/${path}`.
- 실시간 검증, 규칙 위반 시 빨간 에러 + Create 비활성화.

---

## 운영 규칙 (초기 네이밍 가이드)

| prefix      | 용도                                                                                 |
| ----------- | ------------------------------------------------------------------------------------ |
| **yt/**     | 유튜브 워크플로우 단계: 검색/시청/액션/검증 (예: yt/preflight, yt/watch, yt/actions) |
| **device/** | 디바이스 온보딩, 최적화, ADB 재시작/재연결 (예: device/adb/restart, device/onboard)  |
| **ops/**    | 운영: 헬스체크, 로그 수집, 진단 (예: ops/health, ops/logs, ops/diagnose)             |
