# UI 테마 및 일러스트 배치 요약

## 변경된 파일 목록 (UI/asset/theme 중심)

### 테마
- `lib/materio-layout/MuiTheme.tsx` — 노랑/파랑 팔레트, 라이트 모드, BRAND 토큰, shape/shadows

### 공용 컴포넌트
- `lib/materio-layout/StatusStrip.tsx` — 상단 파랑→노랑 그라데이션 스트립
- `lib/materio-layout/PageHeader.tsx` — 타이틀 + 서브타이틀 + 오른쪽 일러스트 슬롯 + action
- `lib/materio-layout/EmptyState.tsx` — 일러스트 + 메시지 + CTA 슬롯 (빈 상태용)

### 레이아웃
- `lib/materio-layout/DashboardLayout.tsx` — StatusStrip 추가, 사이드바 하단 워터마크(illu-char-1, opacity 0.08)

### 페이지 (UI만 변경)
- `app/(app)/ops/page.tsx` — PageHeader, KPI 카드 상단 라인(primary/accent), 2개 카드 스티커
- `app/(app)/youtube/channels/page.tsx` — PageHeader, EmptyState(채널 0개)
- `app/(app)/youtube/contents/page.tsx` — PageHeader, EmptyState(콘텐츠 0개)
- `app/(app)/events/page.tsx` — PageHeader, EmptyState(이벤트 0개), 린트 보조 함수

### 에셋
- `public/illustrations/` — `packages/ui/asset`에서 복사·이름 정리  
  - `illu-1.jpg` … `illu-8.jpg`  
  - `illu-char-1.png` … `illu-char-5.png`

---

## 적용된 색상 토큰

| 역할 | Hex | 용도 |
|------|-----|------|
| **Primary (Blue)** | `#1976d2` | 버튼, 링크, 활성 메뉴, 강조, KPI 카드 상단 라인 |
| Primary Light | `#42a5f5` | |
| Primary Dark | `#1565c0` | |
| **Accent (Yellow)** | `#f9a825` | 배지/하이라이트, StatusStrip 끝, KPI 카드 포인트 |
| Accent Light | `#ffca28` | |
| Accent Dark | `#f57f17` | |
| Background | `#fafafa` | 페이지 배경 |
| Paper | `#ffffff` | 카드/페이퍼 |

---

## 이미지 배치 요약

| 화면 | 위치 | 파일 | 비고 |
|------|------|------|------|
| **전역** | 상단 스트립 | — | 파랑→노랑 그라데이션 (이미지 없음) |
| **사이드바** | 하단 워터마크 | `illu-char-1.png` | 투명도 8%, md 이상에서만 |
| **Operations** | 헤더 오른쪽 | `illu-char-1.png` (150px) | |
| **Operations** | KPI 카드 1 (Online devices) | `illu-char-3.png` (48px 스티커) | |
| **Operations** | KPI 카드 2 (Warning devices) | `illu-char-4.png` (48px 스티커) | |
| **YouTube — Channels** | 헤더 오른쪽 | `illu-char-2.png` (140px) | |
| **YouTube — Channels** | 빈 상태(채널 0) | `illu-char-1.png` | 중앙 일러스트 + 문구 |
| **YouTube — Contents** | 헤더 오른쪽 | `illu-char-3.png` (140px) | |
| **YouTube — Contents** | 빈 상태(콘텐츠 0) | `illu-char-4.png` | 중앙 일러스트 + 문구 |
| **Events / Logs** | 헤더 오른쪽 | `illu-char-5.png` (140px) | |
| **Events / Logs** | 빈 상태(이벤트 0) | `illu-char-2.png` | 중앙 일러스트 + 문구 |

- 테이블/리스트 뒤에는 일러스트를 깔지 않음 (가독성 유지).
- 장식용 이미지는 `alt=""` 및 `aria-hidden` 처리.

---

## 과하지 않게 유지하기 위한 규칙 5줄

1. **노랑은 큰 면적 배경으로 쓰지 않는다** — 상단 스트립·카드 상단 라인·배지/칩 정도만 사용.
2. **일러스트는 빈 상태·헤더·사이드바·KPI 1~2개에만 둔다** — 테이블/리스트 뒤나 모든 카드에 넣지 않는다.
3. **섹션 헤더 일러스트는 120~180px로 제한**하고, 모바일(xs)에서는 숨긴다.
4. **사이드바 워터마크는 투명도 6~12%**로 두어 클릭·가독성을 해치지 않는다.
5. **경고/에러 영역에는 귀여운 캐릭터를 넣지 않는다** — 톤 불일치 방지.
