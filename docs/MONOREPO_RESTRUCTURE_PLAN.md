# 모노레포 재구성: 이동/삭제/유지 목록

## 1. 이동 (Move)

| 현재 경로 | 목적지 | 근거 |
|-----------|--------|------|
| `app/` | `apps/web/` | Next 단일 앱을 배포 단위로 apps 아래로 이동, app/app 중첩 제거(라우팅은 apps/web/app 유지) |
| `packages/agent-electron/` | `apps/desktop/` | Electron 배포 단위를 apps로 통일 |
| `shared/` | `packages/shared/` | 공유 코드를 packages로 승격, 워크스페이스 일관성 |
| `types/` (루트) | `apps/web/types/` | Next 관련 타입은 웹앱 소유로 이전 |

## 2. 삭제 (Delete)

| 대상 | 근거 |
|------|------|
| `app/tests/` | 테스트폴더 삭제 요청; e2e/스크립트는 필요 시 apps/web/tests로 복구 또는 스크립트에서 제거 |
| (레거시) `temp/` | 레거시폴더 삭제 요청; 보존 필요 시 _archive/agent-legacy로 이동 후 삭제 |

## 3. 아카이브 (Archive)

| 대상 | 목적지 | 근거 |
|------|--------|------|
| `temp/agent/` | `_archive/agent-legacy/` | legacy 격리 요청, 코드 보존 |

## 4. 유지 (Keep)

| 경로 | 근거 |
|------|------|
| `docs/` | 문서 루트 유지 |
| `scripts/` | 루트 스크립트 유지 |
| `_archive/` | 기존 아카이브 유지 |
| `.github/` | CI/CD 유지 (경로 참조만 수정) |
| 루트 설정 파일들 | `package.json`, `eslint.config.mjs`, `vercel.json`, `turbo.json` 등 유지 후 내용만 수정 |

## 5. 최종 디렉터리 규칙

- **배포 단위**: `apps/*` (apps/web = Next, apps/desktop = Electron)
- **공유 코드**: `packages/*` (packages/shared)
- **Next 라우팅**: `apps/web/app` 유지
- **빌드 산출물**: node_modules, .pnpm-store, .next, dist, release 등 .gitignore 보장

---

## 6. 최종 파일 트리 (요약)

```
doai.me/
├── apps/
│   ├── web/                    # Next.js (배포 단위)
│   │   ├── app/                # Next App Router (라우팅: app/(app)/, app/api/, app/login 등)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── supabase/
│   │   ├── types/
│   │   ├── tests/              # 스텁만 있음 (e2e 복구 시 교체)
│   │   ├── next.config.js
│   │   ├── package.json        # @doai/dashboard
│   │   └── ...
│   └── desktop/                 # Electron (배포 단위)
│       ├── src/
│       ├── package.json        # @doai/client
│       └── ...
├── packages/
│   └── shared/                 # @doai/shared (공유 코드)
├── _archive/
│   └── agent-legacy/           # 이전 temp/agent 보존
├── docs/
├── scripts/
├── pnpm-workspace.yaml
├── package.json                # 루트: dev → @doai/dashboard, client:dev → @doai/client
└── ...
```

## 7. 깨질 수 있는 포인트와 확인 체크리스트

| 항목 | 확인 방법 |
|------|-----------|
| **Vercel 배포** | Vercel 프로젝트 설정에서 Root Directory를 `apps/web`으로 지정. 또는 빌드/설치 커맨드를 `pnpm install && pnpm --filter @doai/dashboard build` 등으로 설정 |
| **Supabase** | `db:verify`, `db:push` 등은 `apps/web/supabase` 기준. 스크립트 경로는 이미 `apps/web/supabase/verify_schema.sql`로 수정됨 |
| **E2E/API 테스트** | `pnpm run test:e2e`, `test:api`는 `apps/web/tests/` 스텁을 사용. 실제 테스트 복구 시 해당 파일 교체 |
| **Electron CI** | `.github/workflows/agent-electron-release.yml`에서 `apps/desktop` 경로 및 `pnpm install --frozen-lockfile` 사용. Windows runner에서 electron postinstall은 기본 허용됨 |
| **Electron 첫 설치** | 새 클론 후 `pnpm install`만으로는 electron 바이너리가 안 받아질 수 있음. `pnpm rebuild electron` 또는 루트 `package.json`의 `pnpm.onlyBuiltDependencies`에 `electron` 포함됨 → 재설치 시 자동 실행 |
| **문서/코드 내 경로** | `app/`, `packages/agent-electron` 참조는 `apps/web/`, `apps/desktop/`로 수동 갱신 필요 (docs, 주석, 외부 링크) |
| **import @/ 경로** | `apps/web` 내 tsconfig `paths "@/*": ["./*"]` 유지 → 기존 `@/components` 등 변경 없음 |
