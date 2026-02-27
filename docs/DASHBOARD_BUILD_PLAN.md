# DoAi.Me 대시보드 빌드 플랜 (보완본)

> 원본: AI 에이전트 기획
> 보완: 실제 코드베이스 대조 후 수정
> ⚠️ = 원본에서 수정된 부분

---

## 현재 상태 (이미 있는 것)

```
이미 존재:
  ✅ app/login/page.tsx — 로그인 (이메일/비밀번호, Supabase Auth)
  ✅ app/dashboard/layout.tsx — 사이드바 + 메인 레이아웃 (shadcn Sidebar)
  ✅ app/dashboard/page.tsx — 개요 대시보드 (스탯 카드, 차트)
  ✅ app/dashboard/workers/ — 워커 목록
  ✅ app/dashboard/devices/ — 디바이스 테이블
  ✅ app/dashboard/proxies/ — 프록시 관리
  ✅ app/dashboard/channels/ — 채널 관리
  ✅ app/dashboard/tasks/ — 작업 관리
  ✅ app/dashboard/settings/ — 설정
  ✅ app/dashboard/adb/ — ADB 콘솔
  ✅ app/dashboard/logs/ — 로그

필요한 것 (개선/신규):
  🔧 전체 디자인 리뉴얼 (현재 기본 shadcn → 커맨드 센터 콘셉트)
  🆕 우측 패널 (시계, 알림, 리소스)
  🆕 콘텐츠 등록 페이지
  🆕 영상 대기열 (큐) 페이지
  🆕 네트워크 시각화 페이지
  🆕 에러 전용 페이지
  🆕 로그인 디자인 리뉴얼
```

---

## ⚠️ 원본 대비 수정사항

### 1. 라우팅 구조

```diff
- app/(auth)/login/page.tsx
+ app/login/page.tsx              ← 이미 존재, 리뉴얼

- app/(dashboard)/page.tsx
+ app/dashboard/page.tsx          ← 이미 존재. /dashboard가 기본 경로

- app/(dashboard)/pc/page.tsx
+ app/dashboard/workers/page.tsx  ← 이미 존재. 메뉴명만 "PC"로 변경
```

⚠️ **Route Group `(dashboard)` 사용 안 함** — 현재 `/dashboard/*` 경로가 이미 작동 중.
URL을 `/`로 바꾸려면 middleware + 전체 리팩토링 필요. 현재 구조 유지 권장.

### 2. API 매핑 수정

| 원본 API | 실제 API | 비고 |
|----------|---------|------|
| ~~GET /api/overview~~ | `GET /api/overview` | ✅ 존재함 (원본 맞음) |
| GET /api/dashboard/realtime | ✅ 존재 | |
| GET /api/health | ✅ 존재 | `?report=true`로 상세 |
| GET /api/workers | ✅ 존재 | "PC" 표시용 |
| GET /api/workers/[id] | ✅ 존재 | PC 상세 |
| ~~GET /api/youtube/videos~~ | `GET /api/youtube/videos?channelId=&hours=` | ⚠️ channelId 필수 파라미터 |
| POST /api/channels/[id]/videos | ✅ 존재 | 영상 등록 |
| GET /api/commands/presets | ✅ 존재 | **인증 불필요** |
| POST /api/schedules/[id]/trigger | ✅ 존재 | 수동 트리거 |

### 3. 메뉴 구조 수정

```diff
현재 사이드바:
  개요 → 워커 → 디바이스 → 프록시 설정 → 채널 → 작업 관리 → 설정 → ADB 콘솔 → 로그

제안 (카테고리 + 아이콘 개선):
  OVERVIEW
    대시보드        (LayoutDashboard)  → /dashboard

  INFRASTRUCTURE
-   PC              (Monitor)          → /dashboard/pc
+   PC 관리         (Server)           → /dashboard/workers  ← 기존 경로 유지, 라벨만 변경
    디바이스        (Smartphone)       → /dashboard/devices
    프록시          (Shield)           → /dashboard/proxies
+   네트워크        (Globe)            → /dashboard/network   ← 신규

  CONTENT
    채널 관리       (Tv)               → /dashboard/channels
+   콘텐츠 등록     (Upload)           → /dashboard/content   ← 신규
-   영상 대기열     (ListOrdered)      → /dashboard/queue
+   작업 / 대기열   (ListOrdered)      → /dashboard/tasks     ← 기존 확장

  AUTOMATION
-   명령 프리셋     (Zap)              → /dashboard/presets
+   프리셋          (Zap)              → /dashboard/presets    ← 기존 없음, 신규
    ADB 콘솔       (Terminal)          → /dashboard/adb

  SYSTEM
    설정            (Settings)         → /dashboard/settings
    로그            (FileText)         → /dashboard/logs
+   에러            (AlertTriangle)    → /dashboard/errors     ← 신규
```

### 4. 디자인 시스템 보완

```
현재 이미 적용됨:
  ✅ 다크모드 기본 (html class="dark")
  ✅ shadcn/ui 컴포넌트
  ✅ Tailwind CSS
  ✅ Lucide 아이콘
  ✅ Supabase Auth (middleware 보호)

추가 필요:
  🆕 Geist 폰트 (현재 Pretendard 사용 — 한국어 본문용 유지, 숫자/코드만 Geist Mono)
  🆕 Recharts (차트)
  🆕 SWR (데이터 패칭 — 현재 Zustand 스토어 + useEffect)
  🆕 카운트업 애니메이션
  🆕 우측 패널 컴포넌트
```

⚠️ **Zustand vs SWR**: 현재 `hooks/use-workers-store.ts` 등 Zustand 스토어가 이미 있음.
SWR로 전환 가능하지만, Realtime 구독은 Zustand 유지가 나음.
**권장: SWR(API 패칭) + Zustand(Realtime 상태) 병행**

### 5. 우측 패널

⚠️ 원본 계획 그대로 좋음. 단, **대시보드 페이지에서만 표시**.
구현: `dashboard/page.tsx`에서 조건부 렌더링, 다른 페이지에서는 메인 풀 너비.

### 6. 로그인 화면

⚠️ 현재 로그인이 이미 있지만 디자인이 기본. 리뉴얼 대상.
기존 auth 로직(Supabase signInWithPassword) 유지, UI만 교체.

---

## 보완된 메뉴 ↔ API 매핑

| 메뉴 | 경로 | 주요 API | 상태 |
|------|------|----------|------|
| 대시보드 | /dashboard | realtime, overview, stats, health, errors | 🔧 리뉴얼 |
| PC 관리 | /dashboard/workers | workers, workers/[id] | 🔧 리뉴얼 |
| 디바이스 | /dashboard/devices | devices, devices/[id] | 🔧 리뉴얼 |
| 프록시 | /dashboard/proxies | proxies, proxies/bulk, auto-assign | 🔧 리뉴얼 |
| 네트워크 | /dashboard/network | dashboard/proxies, health?report | 🆕 신규 |
| 채널 관리 | /dashboard/channels | channels, youtube/channels, youtube/sync | 🔧 리뉴얼 |
| 콘텐츠 등록 | /dashboard/content | youtube/videos, channels/[id]/videos | 🆕 신규 |
| 작업/대기열 | /dashboard/tasks | tasks, queue, tasks/[id]/retry, screenshots | 🔧 확장 |
| 프리셋 | /dashboard/presets | presets | 🆕 신규 경로 |
| ADB 콘솔 | /dashboard/adb | commands/presets, commands | 🔧 리뉴얼 |
| 설정 | /dashboard/settings | settings, schedules | 🔧 리뉴얼 |
| 로그 | /dashboard/logs | logs | 🔧 리뉴얼 |
| 에러 | /dashboard/errors | dashboard/errors | 🆕 신규 |

---

## 작업 순서 (보완)

```
Phase A — MVP (기존 리뉴얼, 3일)
  Day 1: Prompt 0 (디자인 시스템 + 폰트 + SWR 셋업)
         Prompt 1 (로그인 리뉴얼)
         Prompt 2 (사이드바 카테고리 + 우측 패널 구조)
  Day 2: Prompt 3 (메인 대시보드 — 가장 중요)
  Day 3: Prompt 5 (디바이스 — 가장 자주 보는 페이지)

Phase B — 핵심 기능 (2일)
  Day 4: Prompt 10 (작업/대기열 확장)
         Prompt 6 (프록시 벌크 기능)
  Day 5: Prompt 8 (채널 관리 개선)
         Prompt 9 (콘텐츠 등록 — 신규)

Phase C — 나머지 (2일)
  Day 6: Prompt 4 (PC 관리)
         Prompt 7 (네트워크 시각화)
  Day 7: Prompt 11 (프리셋)
         Prompt 12 (ADB 콘솔 개선)
         Prompt 13 (설정)
         Prompt 14 (로그/에러)
```

---

## 핵심 원칙

1. **기존 작동하는 코드를 깨지 마라** — API routes, middleware, Zustand 스토어 유지
2. **`/dashboard/*` 경로 유지** — Route group 변경은 리스크 대비 이득이 없음
3. **한국어 UI** — 메뉴, 라벨, 에러 메시지 전부 한국어 (영문 코드/숫자만 Geist Mono)
4. **3초 룰** — 메인 대시보드 로딩 후 3초 안에 시스템 상태 파악 가능해야 함
5. **모바일 대응** — 768px 이하에서도 핵심 정보 접근 가능 (사이드바 토글)
