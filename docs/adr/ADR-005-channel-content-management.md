# ADR-005: 채널/콘텐츠 관리 시스템 (Step 11)

**Status**: Accepted
**Date**: 2026-02-18
**Deciders**: exe-blue 팀

---

## Context

YouTube 자동 시청 파밍을 위해 채널과 영상을 효율적으로 관리해야 했습니다.

### 주요 요구사항
- YouTube 채널 등록 및 모니터링
- 채널별 최신 영상 자동 수집
- 영상 우선순위 및 카테고리 관리
- 배치 태스크 생성 (단일/채널/플레이리스트 모드)
- 영상 분배 전략 (round_robin/random/by_priority)

## Decision

### 1. Two-Panel Layout 채택

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Channels Page                                   │
├──────────────────────────┬──────────────────────────────────────────┤
│   Channel List (30%)     │   Video List (70%)                       │
│   ┌────────────────┐     │   ┌────────────────────────────────────┐ │
│   │ @channel_1     │     │   │ Video Title 1    | Priority: 5    │ │
│   │ @channel_2 ✓   │ ──► │   │ Video Title 2    | Priority: 3    │ │
│   │ @channel_3     │     │   │ Video Title 3    | Priority: 8    │ │
│   └────────────────┘     │   └────────────────────────────────────┘ │
└──────────────────────────┴──────────────────────────────────────────┘
```

### 2. DB 스키마 확장

```sql
-- videos 테이블 확장
ALTER TABLE videos ADD COLUMN category VARCHAR(50);
ALTER TABLE videos ADD COLUMN notes TEXT;
ALTER TABLE videos ADD COLUMN priority INT DEFAULT 5;
ALTER TABLE videos ADD COLUMN play_count INT DEFAULT 0;
ALTER TABLE videos ADD COLUMN is_active BOOLEAN DEFAULT true;
```

### 3. Content Modes

| 모드 | 설명 | 영상 선택 |
|------|------|----------|
| `single` | 단일 영상 | 선택한 1개 영상 |
| `channel` | 채널 전체 | 채널의 모든 활성 영상 |
| `playlist` | 플레이리스트 | (향후 지원) |

### 4. Distribution Strategies

| 전략 | 설명 |
|------|------|
| `round_robin` | 디바이스에 순차 분배 |
| `random` | 랜덤 분배 |
| `by_priority` | 우선순위 높은 영상에 더 많은 디바이스 |

## Consequences

### Positive
- 채널/영상 통합 관리로 운영 효율 향상
- 우선순위 기반 영상 분배로 전략적 시청 가능
- 대량 영상 import 지원 (bulk import)

### Negative
- DB 스키마 마이그레이션 필요
- UI 복잡도 증가

### New Features

- **채널 등록**: YouTube 핸들(@xxx) 또는 URL로 등록
- **자동 영상 수집**: YouTube Data API로 최신 영상 fetch
- **인라인 편집**: 영상 우선순위 클릭 편집
- **카테고리 뱃지**: 영상 분류 표시
- **배치 태스크 생성**: 다중 영상 → 다중 디바이스 작업 생성

## Implementation

### 주요 파일

| 파일 | 역할 |
|------|------|
| `app/api/youtube/channels/route.ts` | 채널 등록 (핸들 resolve) |
| `app/api/youtube/videos/route.ts` | 영상 목록 조회 |
| `app/api/youtube/sync/route.ts` | 전체 채널 동기화 |
| `components/channels-page.tsx` | Two-panel 채널/영상 UI |
| `lib/youtube.ts` | YouTube Data API v3 |
| `lib/db/channels.ts` | 채널 CRUD |
| `lib/db/videos.ts` | 영상 CRUD |

### API Routes

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | /api/youtube/channels | 채널 목록 |
| POST | /api/youtube/channels | 채널 등록 (핸들 resolve) |
| GET | /api/youtube/videos | 영상 목록 (channel_id 필터) |
| GET | /api/youtube/sync | 전체 채널 최신 영상 동기화 |

### Task Executor 수정

```javascript
// agent/task-executor.js
async executeWatchVideo(task) {
  const { video_url, device_serials, distribution } = task.params;

  // 분배 전략에 따라 디바이스-영상 매핑
  const assignments = this.distribute(video_url, device_serials, distribution);

  for (const { serial, url } of assignments) {
    await this.xiaowei.autojsCreate(serial, 'youtube_watch.js', { url });
  }
}
```

## Related

- **Commits**:
  - `998f2c2` feat: STEP 11 — channels, content management & batch task creation
- **PRs**:
  - Related to Step 11 implementation
