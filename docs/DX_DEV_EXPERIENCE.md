# 개발 경험(DX) — 재시작 지옥 해결

## 목표

- **UI(renderer) 수정** → 재시작 없이 반영 (HMR)
- **main/preload 변경** → 자동 재시작만 (수동 `node start` 반복 불필요)
- **한 번에 실행** → `pnpm dev`로 web + desktop 병렬 기동

## 구조

| 구분 | 위치 | 동작 |
|------|------|------|
| **Main** | `apps/desktop/src/main/` | 변경 시 빌드 후 Electron 프로세스 자동 재시작 |
| **Preload** | `apps/desktop/src/preload/` | 변경 시 빌드 후 Electron 프로세스 자동 재시작 |
| **Renderer** | `apps/desktop/src/renderer/` | Vite dev 서버 + React Fast Refresh → **재시작 없이 HMR** |

## 명령어

| 명령 | 설명 |
|------|------|
| `pnpm dev` | **Turbo**: web + desktop 동시 기동 (병렬) |
| `pnpm dev:web` | Next.js만 (apps/web) |
| `pnpm dev:desktop` | Electron만 (apps/desktop) |

## 구현 요약

1. **Desktop**
   - `vite-plugin-electron/simple`: main/preload는 `build.watch`로 감시, renderer는 Vite dev 서버 URL 로드 → renderer HMR 유지.
   - **restartOnMainOrPreloadBuild**: main/preload 빌드가 끝날 때마다 `startup.exit()` 후 `startup()` 호출로 Electron만 재시작.

2. **Turbo**
   - 루트 `dev` 스크립트: `turbo run dev` → `@doai/dashboard`(web), `@doai/client`(desktop)의 `dev`를 병렬 실행.

3. **Shared**
   - `packages/shared`는 현재 빌드 단계 없음(순수 JS). 공유 코드 수정 시 앱이 해당 파일을 참조하면 Next/Vite가 감지해 반영. 나중에 shared에 빌드(예: TS)를 도입하면 그때 watch 빌드 추가 가능.

## 종료 조건 체크

- [x] UI 수정은 재시작 없이 반영 (renderer = Vite dev 서버 + React HMR)
- [x] main/preload 변경만 자동 재시작 (closeBundle 훅에서 restart)
- [x] "계속 node start"를 하지 않아도 됨 (watch + 자동 재시작)
