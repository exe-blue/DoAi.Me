# Env 로딩 규칙 및 작업 규칙 (재발 방지)

## 1. Env 로딩 위치/파일 규칙 (1페이지)

### Desktop (Electron main)

- **로드 순서** (main.ts):  
  1) 패키징 시: `process.resourcesPath/.env`  
  2) `process.cwd()/.env.local`  
  3) `process.cwd()/.env.prod`  
  4) `process.cwd()/.env`
- **기준 디렉터리**: 실행 시 `process.cwd()`는 보통 앱 루트 또는 `apps/desktop`. 개발 시 루트에서 `pnpm run dev` 시에는 모노레포 루트일 수 있음.
- **규칙**: Desktop이 사용하는 SUPABASE_*, XIAOWEI_WS_URL 등은 **한 곳**에서만 정의 권장(예: 루트 `.env` 또는 `apps/desktop/.env.local`). `.env.prod`는 배포용으로만 쓰고, 로컬 개발은 `.env.local` 또는 루트 `.env`.

### Agent (Node 자식 프로세스)

- **로드 위치**: Agent 쪽 config에서 `__dirname` 기준.
  - **packages/agent** 사용 시: `config.js`에서 `path.resolve(__dirname, "../../.env")`, `path.resolve(__dirname, ".env")` 순.
  - **apps/desktop/src/agent** 사용 시: 동일하게 해당 agent의 `__dirname` 기준.
- **패키징**: Dist에서는 `resources/agent`가 cwd이므로 `__dirname/../../.env` = `resources/.env`. 이 파일은 electron-builder의 extraResources로 복사(.env.prod → .env 등)해야 함.
- **규칙**: Agent는 **실행되는 쪽 하나**만 SSOT. Dev면 `apps/desktop` 또는 `packages/agent` 중 실제 spawn되는 경로의 config만 사용. 다른 쪽은 참고용이면 안 되고, 복사본은 만들지 않음.

### 공통

- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: Agent 필수. NEXT_PUBLIC_*만 있으면 일부 config에서 자동 대체하지만, 가능하면 동일 이름으로 통일.
- `XIAOWEI_WS_URL`: 기본 `ws://127.0.0.1:22222/`. 변경 시 Desktop·Agent 모두 같은 값이 보이도록 한 곳에서만 설정.

---

## 2. "복붙 금지"를 대신할 작업 규칙

- **SSOT 유지**: Agent 코드는 **한 트리**만 “실행용”으로 둠. (예: fix/restore에서는 `apps/desktop/src/agent`, main에서는 `packages/agent`.) 다른 위치는 아카이브나 참고용으로만 두고, 실행 경로와 혼동되지 않게 명시.
- **작은 PR/커밋**: 한 번에 한 목적(예: “agent 경로를 packages/agent로 통일”, “env 로딩 순서 수정”). 대량 파일 이동·복붙은 하지 않음.
- **worktree 활용**: 큰 정리/리팩터는 별도 worktree에서 브랜치로 진행하고, 검증 후 main에 머지.
- **문서/agent/docs**: 삭제·복원 시 “어디가 정식”인지 주석 또는 README로 남기고, 동일 내용을 여러 경로에 복붙하지 않음.
- **빌드/실행 검증**: agent 경로·env 변경 후 반드시 `pnpm run dev`(또는 dist)에서 Agent 기동 → Xiaowei 연결 → task_devices claim/run 1회 확인.
