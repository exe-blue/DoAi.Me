# app 폴더 용도 (apps 제거 완료)

**목적:** 웹앱은 **루트의 `app/` 하나**만 사용합니다. `apps/` 폴더는 제거되었습니다.

---

## 1. `app/` (루트) — 단일 Next.js 앱

| 항목 | 내용 |
| ------ | ------ |
| **용도** | **실제 사용 중인** Next.js 15 App Router 앱 (단일 앱) |
| **위치** | 프로젝트 루트 `doai.me/app/` |
| **내용** | `layout.tsx`, `page.tsx`, `app/(app)/` (대시보드·시스템·컨텐츠·자동화 페이지), `app/api/` (API 라우트) |
| **실행** | `npm run dev` → http://localhost:3000 |
| **빌드** | `next build` / Vercel 배포 시 이 `app/` 기준으로 빌드됨 |

**정리:** 대시보드 UI와 API는 모두 **이 `app/` 하나**에 있습니다.

---

## 2. `apps/` 제거 내역

- **제거일:** `apps/` 폴더 및 내부 `apps/dashboard/`(빈 디렉터리) 삭제.
- **코드/설정:** `tsconfig.json`에서 `exclude`의 `apps/**` 제거, `package-lock.json`에서 `apps/dashboard` 패키지 항목 제거.
- **문서:** 플랜/문서에 있던 `apps/dashboard` 경로는 **`app/`** 기준(예: `app/(app)/dashboard/`, `app/api/`)으로 통일하거나 "과거 모노레포 가정"으로 명시해 두었습니다.

---

**요약:** 웹앱은 **`app/`** 만 사용합니다. `apps/` 참조는 코드·설정·문서에서 정리되었습니다.
