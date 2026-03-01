# 모노레포 폴더 이동/삭제 원칙 (규칙집)

파일·폴더 리팩토링·정리가 필요한 시점에 아래 규칙대로 진행한다.

---

## 규칙 A — 실행/배포 단위는 무조건 `apps/`

다음이 있으면 모두 `apps/`로 옮긴다:

- Next.js 프로젝트
- Electron 프로젝트
- 서버/워커(있으면) 예: `apps/api`, `apps/worker`

**판별 기준:** `package.json`이 있고 "단독으로 실행(start/dev)" 되는 단위 = `apps/`.

---

## 규칙 B — 둘 이상이 쓰는 코드는 무조건 `packages/`

다음은 `packages/`로 이동:

- 공통 유틸, 상수, 타입, 스키마(zod)
- API client
- UI 컴포넌트(React 공용이면)
- IPC 채널/DTO(Desktop 전용 공용이면 `desktop-core`)

**판별 기준:** `apps/web`와 `apps/desktop`이 둘 다 import 하거나, 향후 둘 다 쓸 가능성이 높으면 `packages/`.

---

## 규칙 C — 설정 파일이 여러 곳에 중복이면 `packages/config/*`

중복되기 쉬운 것들:

- eslint 규칙
- tsconfig
- prettier 설정
- jest/vitest 설정(선택)

**판별 기준:** 두 앱에서 똑같은 lint/ts 설정을 복붙했으면 config로 중앙화.

---

## 규칙 D — 빌드 산출물/캐시/임시는 레포에서 제거(삭제 + ignore)

무조건 삭제/ignore 대상:

- `node_modules/` (루트/하위 모두)
- `.next/`, `dist/`, `out/`, `build/`, `release/`
- `coverage/`
- `.turbo/`
- `*.log`
- `*.tsbuildinfo`

**원칙:** 이건 "정리"가 아니라 존재 자체가 레포 구조를 더럽히는 요인이라 규칙으로 금지.

---

## 규칙 E — 한 앱에서만 쓰는 코드는 그 앱 내부로

예:

- 데스크톱만 쓰는 기능(윈도우 트레이, autoUpdater, file system) → `apps/desktop/src/main`
- 웹만 쓰는 페이지/컴포넌트 → `apps/web/src`

**판별 기준:** 다른 앱에서 import 하지 않으면 `packages/`로 보내지 말고 앱 안에 둔다.

---

## 규칙 F — 이름이 모호한 폴더는 목적에 따라 강제 분류

자주 보이는 난장판 폴더와 처리:

| 폴더 | 처리 |
|------|------|
| 루트 `src/` | 제거하고, 내용은 `apps/*/src` 또는 `packages/*/src`로 분배 |
| `common/`, `shared/` | 실제 공용이면 `packages/shared`, 아니면 각 앱으로 되돌림 |
| `assets/` | 웹 정적 리소스면 `apps/web/public`; 데스크톱 아이콘/설치 리소스면 `apps/desktop/resources`; 공용 이미지/디자인 시스템 자산이면 `packages/ui`(있을 때) |
| `scripts/` | 빌드/운영 스크립트면 `tooling/scripts`; 특정 앱 전용이면 해당 앱 내부로 |
| `client/`, `server/` | 앱별로 `apps/<app>/src` 아래로 통합 |
| `frontend/`, `backend/` | 실행 단위면 `apps/*`로 이동 |
| `lib/`, `utils/` | 웹 전용이면 `apps/web/src/lib`; 공용이면 `packages/shared` |
| `components/`, `hooks/` (루트) | 한 앱 전용이면 해당 앱(`apps/web/src/...`)으로 이동 |
| `public/` (루트) | 웹이면 `apps/web/public` |

---

## 최종 구조 규칙 요약

- 배포 단위는 `apps/*` (`apps/web` = Next.js, `apps/desktop` = Electron).
- 공유 코드는 `packages/*`.
- Next.js 라우팅 폴더는 `apps/web/app`으로 유지.
- 웹 전용 코드(components, hooks, lib, public)는 `apps/web` 아래로 이동.
- 빌드 산출물/캐시(`node_modules`, `.pnpm-store`, `.next`, `dist` 등)는 레포에서 제거 및 `.gitignore` 보장.
- legacy나 샘플 폴더(`app_legacy`, `getting-started-*`)는 `_archive/`로 이동하거나 별도 `apps/*-legacy`로 격리.
