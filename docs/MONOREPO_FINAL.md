# 모노레포 최종 구조 (pnpm workspace + Turborepo)

## 규칙

- **배포 단위**: `apps/*` (apps/web, apps/desktop)
- **공유 코드**: `packages/*` (packages/shared)
- **Next.js App Router**: `apps/web/app` (app/app 중첩 없음)
- **웹 전용**: components/hooks/lib/public 등은 `apps/web` 아래만 존재
- **빌드/캐시 산출물**: .gitignore로 제외 (node_modules, .pnpm-store, .next, dist, build, out, coverage, .turbo)

---

## 1. 최종 파일 트리 (요약)

```
doai.me/
├── apps/
│   ├── web/                    # Next.js (배포 단위)
│   │   ├── app/                # App Router (라우팅: app/(app)/, app/api/, app/login 등)
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── supabase/
│   │   ├── types/
│   │   ├── tests/
│   │   ├── next.config.js
│   │   ├── package.json        # @doai/dashboard
│   │   └── ...
│   └── desktop/                # Electron + React (배포 단위)
│       ├── src/
│       │   ├── main/
│       │   ├── preload/
│       │   └── renderer/
│       ├── package.json        # @doai/client
│       └── ...
├── packages/
│   └── shared/                # @doai/shared
├── _archive/                   # legacy 보존 (예: agent-legacy)
├── docs/
├── scripts/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── .gitignore
```

---

## 2. 이동/삭제/유지 목록

### 이동 (이미 반영됨)

| 이전 | 현재 | 근거 |
|------|------|------|
| app/ | apps/web/ | 배포 단위를 apps 아래로 통일, app/app 중첩 제거 |
| packages/agent-electron/ | apps/desktop/ | Electron 앱을 apps로 통일 |
| shared/ | packages/shared/ | 공유 코드를 packages로 승격 |
| 루트 types/ | apps/web/types/ | Next 전용 타입을 웹앱 소유로 |

### 삭제 (이미 반영됨)

| 대상 | 근거 |
|------|------|
| app/tests/ (내용) | 테스트 스텁만 유지, e2e 등은 필요 시 복구 |
| temp/ | 레거시는 _archive/agent-legacy로 이전 후 제거 |

### 유지

| 경로 | 근거 |
|------|------|
| docs/, scripts/, _archive/ | 문서·스크립트·아카이브 루트 유지 |
| .github/ | CI 경로만 apps/desktop 등으로 수정 |
| 루트 설정 파일 | package.json, turbo.json, pnpm-workspace.yaml, .gitignore 등 |

### .gitignore 추가 항목

- `.turbo/`
- `coverage/`
- (기존: node_modules/, .pnpm-store/, .next/, out/, dist/, build/, dist-electron/, release/)

---

## 3. 루트 스크립트 골격

| 스크립트 | 명령 | 설명 |
|----------|------|------|
| dev | pnpm run dev:web | 웹만 기동 (최소 실행 보장) |
| dev:web | pnpm --filter @doai/dashboard dev | Next.js |
| dev:desktop | pnpm --filter @doai/client dev | Electron |
| dev:all | turbo run dev --filter=... | web + desktop 병렬 (turbo) |
| build | turbo run build | 웹·데스크톱 빌드 |
| lint | turbo run lint | 린트 |
| test | turbo run test | 테스트 |
| start | pnpm --filter @doai/dashboard start | Next 프로덕션 서버 |

---

## 4. 깨질 수 있는 포인트와 확인 방법

| 항목 | 확인 방법 |
|------|-----------|
| Vercel 배포 | Root Directory = `apps/web`, 빌드 = `pnpm install && pnpm run build` (또는 turbo run build) |
| Supabase | db:verify 등 경로 = `apps/web/supabase/verify_schema.sql` |
| E2E/API 테스트 | 스크립트 경로 = `apps/web/tests/` |
| Electron CI | 워크플로 내 경로 = `apps/desktop` |
| import @/ | apps/web의 tsconfig `paths "@/*": ["./*"]` 유지 |
| 문서/코드 내 경로 | `app/` → `apps/web/`, `packages/agent-electron` → `apps/desktop/` 참조 수동 갱신 |

---

## 5. 완료 체크리스트

- [x] 루트에 `apps/web`, `apps/desktop`, `packages/*` 가 보인다
- [x] `apps/web/app` 이 존재하고, 더 이상 app/app 중첩이 없다
- [x] 루트 node_modules, .pnpm-store 가 .gitignore에 있어 git에 남지 않는다
- [x] `pnpm -w dev` 에서 web이 최소 실행된다 (dev = dev:web)
