# 프론트엔드 수정사항 리뷰 — 사이트 미적용 원인

## 1. 현재 적용된 수정사항 요약

| 항목 | 위치 | 상태 |
| --- | --- | --- |
| 대시보드 셸(사이드바) | `app/dashboard/dashboard-shell.tsx` | ✅ 레이아웃에서 사용 중 (`app/dashboard/layout.tsx`) |
| CSS 변수(디자인 토큰) | `app/globals.css` (`:root`) | ✅ 정의됨 (sidebar, status 등) |
| Tailwind 확장 | `tailwind.config.ts` | ✅ `hsl(var(--*))` 매핑 완료 |
| 디자인 토큰(JS) | `lib/design-tokens.ts` | ✅ 참조용 (컴포넌트에서 직접 사용하는 곳 적음) |
| 디자인 시스템 컴포넌트 | `components/design-system/` | ⚠️ README만 있음, 실제 컴포넌트 없음 |

- **사이드바**: `DashboardShell`은 디자인 토큰(`bg-sidebar`, `text-sidebar-foreground`, `bg-status-success` 등)을 사용하고 있어, `globals.css` / `tailwind.config` 변경이 **사이드바에는 반영됩니다.**

---

## 2. “사이트에 적용되지 않는다”로 보일 수 있는 원인

### 2.1 접속 경로 / 인증

- **`/` (루트)**  
  - 랜딩 전용. 로그인 전에는 여기만 보이고, **대시보드 셸(사이드바)은 전혀 렌더되지 않습니다.**  
  - 로그인된 사용자는 `app/page.tsx`에서 `/dashboard`로 리다이렉트됩니다.
- **`/dashboard`**  
  - 여기서만 `DashboardLayout` → `DashboardShell`이 그려집니다.  
  - **비로그인**이면 `middleware.ts`가 `/dashboard` 접근을 `/login`으로 돌리므로, 대시보드 UI를 볼 수 없습니다.

**정리**:  

- 수정사항을 보려면 **로그인한 뒤 `http://localhost:3000/dashboard`** 로 접속해야 합니다.  
- 랜딩(`/`)만 보고 있으면 “수정이 안 보인다”고 느낄 수 있습니다.

### 2.2 대시보드 본문은 디자인 토큰을 쓰지 않음

- **`app/dashboard/page.tsx`** (대시보드 홈: KPI 카드, 차트, PC 랭킹, 디바이스 상태 등)는  
  **디자인 토큰/테마 변수를 거의 쓰지 않고**, 아래처럼 하드코딩된 색만 사용합니다.
  - 예: `border-[#1a2332]`, `bg-[#0d1520]`, `text-slate-400`, `bg-green-400`, `text-white` 등
- 따라서:
  - **사이드바**: `globals.css` / `tailwind.config` 수정 → **반영됨**
  - **대시보드 메인 콘텐츠(카드·차트·랭킹 등)**: 토큰/테마 수정 → **반영 안 됨** (하드코딩 색이라)

즉, “디자인 시스템을 바꿨는데 사이트에 안 반영된다”는 느낌은,  
**대시보드 본문이 토큰이 아닌 고정 색을 쓰기 때문**입니다.

### 2.3 캐시

- Next.js 빌드 캐시(`.next/`)나 브라우저 캐시 때문에 예전 번들이 보일 수 있습니다.
- **조치**:  
  - 개발 서버 재시작: `npm run dev` 중단 후 다시 실행  
  - 필요 시: `.next` 삭제 후 `npm run dev`  
  - 브라우저: 강력 새로고침(Ctrl+Shift+R) 또는 시크릿 창에서 `http://localhost:3000/dashboard` 확인

### 2.4 다른 앱(포트)을 보고 있는 경우

- **루트 앱** (대시보드 수정이 들어간 곳): 보통 `npm run dev` → **<http://localhost:3000>**
- **`apps/dashboard`**: 별도 Next 앱(예: 3001). 여기는 루트의 `app/dashboard`와 다른 코드베이스입니다.
- **3001 등 다른 포트**를 보고 있으면, 루트의 프론트 수정사항이 전혀 적용된 화면이 아닙니다.

---

## 3. 권장 조치

1. **수정사항이 “안 보인다”고 할 때**
   - **로그인 후 `http://localhost:3000/dashboard`** 에서 확인했는지 확인.
   - 사이드바(로고, 메뉴, 상태 점, 푸터)만 바뀌었을 수 있음 → 그 부분에 토큰이 적용되어 있음.

2. **대시보드 본문까지 디자인 시스템을 통일하려면**
   - `app/dashboard/page.tsx`의 하드코딩 색상을 디자인 토큰으로 교체하는 리팩터가 필요합니다.
   - 예:  
     - `border-[#1a2332]` → `border-border`  
     - `bg-[#0d1520]` → `bg-card`  
     - `text-slate-400` → `text-muted-foreground`  
     - `bg-green-400` → `text-status-success` / `bg-status-success` 등  
   - `lib/design-tokens.ts`·`docs/DESIGN_SYSTEM.md`를 참고해 일관된 토큰으로 맞추면, 이후 테마/토큰 수정이 **전체 대시보드**에 반영됩니다.

3. **캐시 의심 시**
   - `.next` 삭제 후 재실행, 브라우저 강력 새로고침으로 한 번 확인.

4. **design-system 컴포넌트**
   - 현재는 README만 있으므로, 실제 재사용 컴포넌트가 필요하면 `components/design-system/` 아래에 토큰 기반 컴포넌트를 추가하고, 대시보드 페이지에서 점진적으로 사용하는 방식을 권장합니다.

---

## 4. 체크리스트 (프론트 수정 후 “적용 안 됨” 점검)

- [ ] **경로**: 로그인 후 `http://localhost:3000/dashboard` 에서 확인했는가?
- [ ] **영역**: 변경한 것이 사이드바인지, 대시보드 본문(카드/차트)인지 구분했는가? (본문은 현재 토큰 미사용)
- [ ] **캐시**: `npm run dev` 재시작·`.next` 삭제·강력 새로고침을 해봤는가?
- [ ] **포트**: 3000번(루트 앱)을 보고 있는가, 다른 앱(예: 3001)을 보고 있는가?
