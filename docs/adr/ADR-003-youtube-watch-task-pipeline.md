# ADR-003: YouTube 시청 태스크 파이프라인

**Status**: Accepted
**Date**: 2026-02-13
**Deciders**: exe-blue 팀

---

## Context

YouTube 자동 시청 파밍의 핵심 기능인 "영상 시청 태스크"를 구현해야 했습니다.

### 주요 요구사항
- 500대 디바이스에 영상 시청 작업 분배
- 청크 단위 병렬 실행 (노드당 max 20대 동시)
- 디바이스별 진행 상태 추적
- AutoJS 스크립트 기반 YouTube 앱 제어

## Decision

### 1. Chunked Parallel Execution 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Task 생성                                    │
│   video_url: "https://youtube.com/watch?v=xxx"                      │
│   target_devices: 100대                                             │
│   chunk_size: 20                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Agent: Chunk 분할                                 │
│   Chunk 1: device[0-19]  → 동시 실행                                │
│   Chunk 2: device[20-39] → Chunk 1 완료 후 실행                     │
│   Chunk 3: device[40-59] → Chunk 2 완료 후 실행                     │
│   ...                                                                │
└──────────────────────────┬──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Xiaowei: autojsCreate                            │
│   스크립트: youtube_watch.js                                        │
│   params: { video_url, watch_duration, device_serial }              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Per-Device Progress Tracking

```javascript
// task.result 구조
{
  "total": 100,
  "completed": 75,
  "failed": 5,
  "in_progress": 20,
  "devices": {
    "SERIAL001": { "status": "completed", "watch_time": 32 },
    "SERIAL002": { "status": "failed", "error": "timeout" },
    "SERIAL003": { "status": "in_progress", "progress": 0.6 }
  }
}
```

### 3. YouTube Watch 스크립트 (AutoJS)

```javascript
// scripts/youtube_watch.js
function watchVideo(videoUrl, duration) {
  // 1. YouTube 앱 실행
  app.launchPackage("com.google.android.youtube");
  sleep(3000);

  // 2. 검색 또는 딥링크로 영상 열기
  app.startActivity({
    action: "android.intent.action.VIEW",
    data: videoUrl
  });
  sleep(5000);

  // 3. 지정 시간 동안 시청
  sleep(duration * 1000);

  // 4. 앱 종료
  app.killPackage("com.google.android.youtube");
}
```

## Consequences

### Positive
- 청크 단위 실행으로 시스템 부하 분산
- 디바이스별 진행 상태 실시간 추적
- 실패한 디바이스만 재시도 가능

### Negative
- 청크 크기(20)로 인한 전체 완료 시간 증가
- AutoJS 스크립트의 YouTube 앱 UI 변경 취약성

### Risks
- YouTube 앱 업데이트 시 스크립트 수정 필요
- 네트워크 지연으로 인한 타임아웃

## Implementation

### 주요 파일

| 파일 | 역할 |
|------|------|
| `agent/task-executor.js` | 태스크 타입별 실행 로직 |
| `scripts/youtube_watch.js` | AutoJS 시청 스크립트 |
| `agent/supabase-sync.js` | 진행 상태 Broadcast |
| `components/tasks-page.tsx` | 디바이스 진행 그리드 UI |

### Task Types

| task_type | 설명 | 프리셋/스크립트 |
|-----------|------|-----------------|
| `watch_video` | 영상 시청 | youtube_watch.js |
| `subscribe` | 채널 구독 | youtube_subscribe.js |
| `like` | 좋아요 | youtube_like.js |
| `comment` | 댓글 | youtube_comment.js |

### Broadcast Progress

```javascript
// 청크 완료 시 Broadcast
await channel.send({
  type: 'broadcast',
  event: 'progress',
  payload: {
    task_id: task.id,
    chunk: chunkIndex,
    completed: completedDevices,
    failed: failedDevices
  }
});
```

## Related

- **Commits**:
  - `67dab12` feat(script): implement basic youtube_watch.js
  - `2307d7a` feat(agent): add E2E verification pipeline
  - `36eddd7` feat(agent): add YouTube chunked parallel execution
  - `9baec8f` feat(dashboard): show real per-device progress
  - `0db8c9c` feat(agent): broadcast task progress per chunk
- **Documents**:
  - `docs/plans/2026-02-13-youtube-watch-task-design.md`
  - `docs/plans/2026-02-13-youtube-watch-task-plan.md`
