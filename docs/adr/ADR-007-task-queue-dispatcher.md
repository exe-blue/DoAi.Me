# ADR-007: Task Queue Dispatcher & Schedule Evaluator (Step 12)

**Status**: Accepted
**Date**: 2026-02-22
**Deciders**: exe-blue 팀

---

## Context

채널 등록 후 새 영상이 업로드되면 자동으로 시청 태스크를 생성하고 실행해야 했습니다.

### 주요 요구사항
- 스케줄 기반 자동 태스크 생성
- 태스크 큐에서 pending 작업 자동 분배
- Cron 기반 YouTube 채널 모니터링
- on_upload 트리거: 새 영상 감지 시 자동 태스크 생성

## Decision

### 1. Queue Dispatcher 아키텍처

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Agent: Queue Dispatcher                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Polling Loop (10초 주기)                                        ││
│  │  1. SELECT * FROM tasks WHERE status='pending'                  ││
│  │  2. 가용 디바이스 확인 (status='idle')                           ││
│  │  3. 태스크 → 디바이스 할당                                       ││
│  │  4. Xiaowei autojsCreate 호출                                    ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Schedule Evaluator 로직

```javascript
// agent/schedule-evaluator.js
class ScheduleEvaluator {
  async evaluate() {
    const schedules = await this.getActiveSchedules();

    for (const schedule of schedules) {
      if (this.shouldTrigger(schedule)) {
        await this.createTasksForSchedule(schedule);
        await this.updateLastTriggered(schedule.id);
      }
    }
  }

  shouldTrigger(schedule) {
    switch (schedule.trigger_type) {
      case 'on_upload':
        return this.hasNewVideos(schedule.channel_id);
      case 'interval':
        return this.intervalElapsed(schedule);
      case 'cron':
        return this.cronMatches(schedule.cron_expression);
    }
  }
}
```

### 3. Trigger Types

| trigger_type | 설명 | 설정 |
|--------------|------|------|
| `on_upload` | 새 영상 업로드 시 | channel_id |
| `interval` | 주기적 실행 | interval_minutes |
| `cron` | Cron 표현식 | cron_expression |

### 4. YouTube Cron (Vercel)

```typescript
// app/api/cron/youtube-sync/route.ts
export async function GET() {
  // 1. 모니터링 활성화된 채널 조회
  const channels = await getMonitoringChannels();

  // 2. 각 채널의 최신 영상 fetch
  for (const channel of channels) {
    const videos = await fetchRecentVideos(channel.channel_id);

    // 3. 새 영상 INSERT
    for (const video of videos) {
      await upsertVideo(video);
    }
  }

  // 4. on_upload 스케줄 트리거
  await evaluateOnUploadSchedules();
}
```

## Consequences

### Positive
- 자동화된 영상 모니터링 및 태스크 생성
- 유연한 스케줄 설정 (on_upload/interval/cron)
- 디바이스 가용성 기반 태스크 분배

### Negative
- Vercel Cron 실행 제한 (Hobby: 일 1회)
- YouTube API 쿼터 소비

### Vercel Cron 설정

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/youtube-sync",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

## Implementation

### 주요 파일

| 파일 | 역할 |
|------|------|
| `agent/queue-dispatcher.js` | pending 태스크 폴링 및 분배 |
| `agent/schedule-evaluator.js` | 스케줄 평가 및 태스크 생성 |
| `app/api/cron/youtube-sync/route.ts` | YouTube 채널 동기화 cron |
| `app/api/schedules/route.ts` | 스케줄 CRUD API |
| `lib/db/schedules.ts` | 스케줄 DB 헬퍼 |
| `hooks/use-schedules-store.ts` | 스케줄 Zustand 스토어 |

### Dashboard Queue Panel

```
┌─────────────────────────────────────────────────────────────────────┐
│  Queue Panel                                                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐          │
│  │ Pending: 45 │ Running: 20 │ Done: 1,234 │ Failed: 12  │          │
│  └─────────────┴─────────────┴─────────────┴─────────────┘          │
│                                                                      │
│  Recent Tasks:                                                       │
│  ├─ watch_video | @channel_1 | 20 devices | running                 │
│  ├─ subscribe   | @channel_2 | 50 devices | pending                 │
│  └─ like        | @channel_1 | 30 devices | completed               │
└─────────────────────────────────────────────────────────────────────┘
```

### Video Dispatcher

새로 추가된 Video Dispatcher는 스케줄에 따라 영상을 디바이스에 분배:

```javascript
// lib/video-dispatcher.ts
export async function dispatchVideosToDevices(
  videoIds: string[],
  deviceCount: number,
  strategy: 'round_robin' | 'random' | 'by_priority'
) {
  const videos = await getVideosByIds(videoIds);
  const devices = await getIdleDevices(deviceCount);

  return distribute(videos, devices, strategy);
}
```

## Related

- **Commits**:
  - `7de80b4` feat: STEP 12 — task queue dispatcher and schedule evaluator
  - `682f6e3` feat: channel registration API + video-dispatcher + cron
  - `4fe0252` feat: DB schema alignment + YouTube cron + Agent v3.0 clean boot
- **Documents**:
  - `VIDEO_DISPATCHER_INSTRUCTIONS.md`
