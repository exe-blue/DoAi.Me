# DoAi.Me 디자인 시스템

> 대시보드 UI의 Single Source of Truth.  
> Fleet Console에 맞는 정제된 톤과 일관된 명칭·토큰을 정의합니다.

---

## 1. 용어 (Terminology)

API·DB와 대시보드 표기를 맞춥니다. **이전 명칭 → 현재 명칭**으로 통일합니다.

| 이전 명칭 | 현재 명칭 | 비고 |
|----------|----------|------|
| 워커 (Worker) | **PC** | Node PC = Windows에서 Agent가 돌아가는 호스트 1대 |
| 워커 목록 | PC 목록 | `/dashboard/workers` → 라벨만 "PC"로 표기 |
| Fleet Console | DoAi.Me Fleet Console | 앱 타이틀 일관 |

- **PC**: Agent가 설치된 Windows 머신 1대. 여러 디바이스(스마트폰)를 연결합니다.
- **디바이스**: USB/OTG로 PC에 연결된 스마트폰 1대.
- **태스크**: PC/디바이스에 내려보내는 작업 단위.
- **프리셋**: Xiaowei Action/스크립트로 재사용하는 명령 묶음.

---

## 2. 디자인 토큰 (Design Tokens)

### 2.1 색상 (Colors)

CSS 변수는 `app/globals.css`의 `:root`에 정의되어 있으며, Tailwind는 `hsl(var(--name))`로 참조합니다.

| 용도 | CSS 변수 | 용도 설명 |
|------|----------|-----------|
| 배경 | `--background` | 페이지·패널 기본 배경 |
| 전경(텍스트) | `--foreground` | 본문 텍스트 |
| 카드 | `--card`, `--card-foreground` | 카드/패널 배경·텍스트 |
| Primary | `--primary`, `--primary-foreground` | CTA, 강조, 브랜드 |
| Secondary | `--secondary`, `--secondary-foreground` | 보조 버튼·영역 |
| Muted | `--muted`, `--muted-foreground` | 비활성·보조 텍스트 |
| Accent | `--accent`, `--accent-foreground` | 호버·선택 강조 |
| Destructive | `--destructive`, `--destructive-foreground` | 삭제·위험 |
| Border / Input / Ring | `--border`, `--input`, `--ring` | 테두리·입력·포커스 링 |

**시맨틱 상태 (status)**  
- `--status-success`: 성공·온라인  
- `--status-warning`: 경고·주의  
- `--status-error`: 에러·오프라인  
- `--status-info`: 정보  
- `--status-neutral`: 중립  

**사이드바**  
- `--sidebar-*`: 사이드바 전용 배경·전경·강조·테두리.

### 2.2 타입스케일 (Typography)

| 토큰 | Tailwind 클래스 | 용도 |
|------|-----------------|------|
| Page title | `text-2xl font-semibold` | 페이지 제목 |
| Section title | `text-lg font-medium` | 섹션 헤더 |
| Card title | `text-base font-medium` | 카드·리스트 제목 |
| Body | `text-sm` | 본문 |
| Caption | `text-xs text-muted-foreground` | 보조·캡션 |
| Mono | `text-sm font-mono` | ID·시리얼·코드 |

폰트 패밀리: `Pretendard Variable` (tailwind.config.ts `fontFamily.sans`).

### 2.3 간격 (Spacing)

Tailwind 기본 스케일 사용. 자주 쓰는 값:

| 용도 | 클래스 | 값 |
|------|--------|-----|
| 페이지 패딩 | `p-4` | 16px |
| 섹션 간격 | `gap-6` | 24px |
| 카드 내부 | `p-4`, `gap-3` | 16px, 12px |
| 폼 요소 간 | `space-y-2` | 8px |

### 2.4 모서리·그림자 (Radius & Shadow)

- **Radius**: `--radius` (기본 0.5rem). Tailwind `borderRadius`는 토큰 기반으로 확장됨.  
  - `rounded-xl` = `calc(var(--radius) + 2px)` — 카드·패널 등 큰 블록  
  - `rounded-lg` = `var(--radius)`  
  - `rounded-md` = `calc(var(--radius) - 2px)`  
  - `rounded-sm` = `calc(var(--radius) - 4px)`  
- **Shadow**: shadcn 기본 `shadow`, `shadow-sm` 사용. 카드·모달에만 사용해 시각적 계층 유지.

---

## 3. 컴포넌트 계층

1. **`components/ui/`**  
   shadcn 기반 원시 컴포넌트 (Button, Card, Input, Table 등). 디자인 토큰을 그대로 사용.

2. **`components/design-system/`**  
   디자인 시스템 수준의 블록.  
   - 토큰과 타입스케일을 엄격히 따름.  
   - 여기에 추가되는 컴포넌트는 이 문서와 **`components/design-system/README.md`** 규칙을 따릅니다.  
   - 적합한 컴포넌트를 하나씩 이 폴더에 전달해 통일된 룩을 유지합니다.

3. **`components/farm/`**  
   도메인 전용 (디바이스 그리드, 태스크 폼 등). design-system·ui를 조합.

---

## 4. 대시보드 메뉴·목적 정리

API 명세(`docs/api-endpoint.md`) 기준으로, 각 메뉴의 목적과 필요한 데이터를 정리합니다.

| 메뉴(현재) | 권장 라벨 | 목적 | 주요 API·데이터 |
|------------|-----------|------|----------------|
| 개요 | 개요 | 전체 상태 한눈에 | `/api/dashboard/realtime`, `/api/dashboard/missions`, `/api/dashboard/errors`, `/api/stats`, `/api/overview` |
| 워커 | **PC** | PC(노드) 목록·상세·헬스 | `/api/workers`, `/api/workers/[id]` |
| 디바이스 | 디바이스 | 기기 목록·상태·필터 | `/api/devices` (?worker_id, ?status) |
| 프록시 설정 | 프록시 | 프록시 풀·할당 | `/api/proxies`, `/api/dashboard/proxies` |
| 채널 | 채널 | 채널·영상 관리 | `/api/channels`, `/api/channels/[id]/videos` |
| 작업 관리 | 작업 | 태스크 CRUD·진행 | `/api/tasks`, `/api/queue` |
| 설정 | 설정 | 시스템 설정 | `/api/settings` |
| ADB 콘솔 | ADB 콘솔 | 명령 실행·로그 | `/api/commands`, `/api/commands/presets` |
| 로그 | 로그 | 태스크·실행 로그 | `/api/logs` |

---

## 5. 톤 & 매너

- **Fleet Console**: 500대 규모 물리 디바이스 관제에 맞게, 정보 밀도와 가독성을 우선합니다.
- **정제된 UI**: 불필요한 장식은 줄이고, 상태(온라인/오프라인/에러)·숫자·라벨이 명확히 보이도록 합니다.
- **일관된 명칭**: 코드·API·화면 모두 위 용어 표를 따릅니다.

---

## 6. 다음 단계

1. **디자인 시스템 구조**  
   - `lib/design-tokens.ts`: 토큰 이름·스케일 상수 **(권장)**. 프로젝트에 이미 존재하며, `components/design-system/README.md`에서 색·타이포·간격·radius를 이 파일과 이 문서에 맞추도록 규정하고 있음. design-system 및 farm 컴포넌트 작성 시 참고.  
   - `components/design-system/`: 공통 블록 추가 시 `README.md` 규칙 준수.

2. **대시보드 반영**  
   - 사이드바·페이지 제목: "워커" → "PC" 등 용어 변경.  
   - 각 메뉴별로 위 표의 API·목적에 맞게 데이터 구성 및 컴포넌트 배치.

3. **컴포넌트 전달**  
   - 적합한 컴포넌트를 `components/design-system/` 또는 `components/farm/`에 하나씩 추가하며, 이 문서의 토큰·타입스케일·용어를 맞춥니다.
