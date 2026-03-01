# Electron + React DX — apps/desktop

## 목표

- **Renderer(UI)**: HMR로 재시작 없이 반영
- **Main/Preload**: 변경 시에만 Electron 프로세스 자동 재시작
- **pnpm -w dev**: web + desktop 동시 기동

---

## 1. 구조 (main / preload / renderer 분리)

| 구분 | 경로 | 스택 | 빌드/실행 |
|------|------|------|-----------|
| **Main** | `apps/desktop/src/main/` | Node + TS | Vite plugin → `dist-electron/index.js` |
| **Preload** | `apps/desktop/src/preload/` | Node + TS | Vite plugin → `dist-electron/bridge.mjs` |
| **Renderer** | `apps/desktop/src/renderer/` | Vite + React + TS | Vite dev 서버 (dev) / `dist/` (prod) |

- **번들 파이프라인**: `vite-plugin-electron/simple` 이 main/preload 를 감시·빌드하고, renderer 는 동일 Vite 앱에서 dev 서버로 제공.
- **보안**: `nodeIntegration: false`, `contextIsolation: true`, preload 에서 `contextBridge` 로 `window.agent` 만 노출.

---

## 2. 어떤 변경이 어떤 재시작을 유발하는지

| 변경 대상 | 재시작/반영 방식 | 비고 |
|-----------|------------------|------|
| **Renderer** (src/renderer/*.tsx, *.ts, *.css 등) | **재시작 없음** — Vite HMR (React Fast Refresh) | 브라우저 탭만 갱신 |
| **Main** (src/main/**) | **Electron 자동 재시작** | closeBundle 시 `startup.exit()` → `startup()` |
| **Preload** (src/preload/**) | **Electron 자동 재시작** | 동일 |
| **index.html** (루트) | **Electron 자동 재시작** | Vite 가 HTML 을 감시·재빌드 시 main/preload 와 함께 처리될 수 있음 (동일 플로우) |

정리: **UI(renderer)만 수정하면 앱 재시작 없이 반영**, **main/preload 수정 시에만 Electron 이 자동 재시작** 됨.

---

## 3. pnpm -w dev 한 줄로 모두 띄우기

```bash
pnpm -w dev
```

- **동작**: 루트 `dev` 스크립트가 `concurrently` 로 **web** 과 **desktop** 을 병렬 실행.
  - `pnpm run dev:web` → Next.js (apps/web)
  - `pnpm run dev:desktop` → Electron + Vite (apps/desktop)
- **packages/shared**: 현재 빌드 단계 없음(순수 JS). watch 는 없음. 필요 시 `packages/shared` 에 `dev` 스크립트 추가 후 `concurrently` 에 세 번째 명령으로 넣으면 됨.

**Turbo 로만 띄우고 싶을 때** (선택):

```bash
pnpm run dev:all
# = turbo run dev --filter=@doai/dashboard --filter=@doai/client
```

- `turbo.json` 의 `dev` 는 `cache: false`, `persistent: true` 로 설정됨.

---

## 4. 완료 체크리스트

- [x] **Renderer UI 변경 시 Electron 재시작 없이 반영된다 (HMR)**  
  - dev 시 `mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)` 로 Vite dev 서버 로드 → React Fast Refresh 적용.
- [x] **Main/Preload 변경 시에만 Electron 이 자동 재시작된다**  
  - `restartOnMainOrPreloadBuild()` 플러그인이 main/preload 빌드 `closeBundle` 시 `startup.exit()` 후 `startup()` 호출.
- [x] **pnpm -w dev 가 web + desktop 을 함께 띄운다**  
  - 루트 `dev` = `concurrently -n web,desktop "pnpm run dev:web" "pnpm run dev:desktop"`.
