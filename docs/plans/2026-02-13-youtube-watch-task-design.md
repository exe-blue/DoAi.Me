# YouTube Watch Task Pipeline — Design Doc

**Date:** 2026-02-13
**Phase:** C (핵심 기능 — YouTube 시청 명령 → 실행)
**Approach:** B. Chunked Parallel (청크 병렬 실행)

## Goal

Dashboard에서 YouTube 시청 태스크를 생성하면, Agent가 수신하여 디바이스 청크 단위로 YouTube 앱 실행 + 시청 스크립트를 실행하고, 디바이스별 진행률을 실시간으로 대시보드에 표시한다.

## Architecture

```
Dashboard → POST /api/tasks → Supabase tasks INSERT
  → broadcast_to_channel() trigger → room:tasks broadcast
  → Agent subscribeToBroadcast() 수신

Agent executeYouTubeTask():
  → resolve target device serials
  → insert task_devices rows (per-device tracking)
  → chunk devices into groups of 5
  → per chunk:
      1. adbShell(am start YouTube)
      2. sleep(3s)
      3. autojsCreate(youtube_watch.js)
      4. update task_devices (done/failed)
      5. broadcast progress to room:task:<id>
  → aggregate results → update task status (completed/failed)
  → broadcast final status to room:tasks
```

## Design Decisions

### 1. App Launch: adbShell am start
- Xiaowei client에 startApk 없음
- `adbShell("am start -n com.google.android.youtube/.HomeActivity")` 사용
- adbShell 후 APP_LAUNCH_DELAY (3초) 대기

### 2. Script Scope: 기본 시청만
- youtube_watch.js: URL로 영상 열기 + watchDuration 대기 + 완료
- 좋아요/구독/댓글은 Phase D 이후

### 3. Per-Device Tracking via task_devices
- TS agent의 기존 insertTaskDevice/updateTaskDevice 메서드 활용
- 각 디바이스마다 task_devices 행 생성
- 청크 완료 시 해당 디바이스들 done/failed 업데이트
- 진행률 = (done + failed) / total

### 4. Chunked Parallel Execution (CHUNK_SIZE = 5)
- 속도와 추적 균형: 4청크 × ~35초 = ~2.5분 (20대 기준)
- Xiaowei bulk 명령 활용 (comma-separated serials)
- 청크 내 디바이스는 동시 완료 처리

### 5. Progress Broadcasting
- 기존 broadcast_to_channel() trigger가 tasks UPDATE 시 room:tasks로 전파
- Agent가 청크마다 task.result를 {done, failed, total}로 갱신
- Dashboard의 useTasksBroadcast onUpdate가 자동 수신
- 별도 progress 훅 불필요

### 6. Agent Target: TS Only
- agent/src/*.ts만 수정, CJS는 레거시로 유지
- Phase B와 일관성

## Error Handling

| 단계 | 실패 시나리오 | 처리 |
|------|-------------|------|
| adbShell am start | Xiaowei 연결 끊김 | 청크 전체 failed, 다음 청크 계속 |
| autojsCreate | 스크립트 경로 없음 | 청크 전체 failed, task_log 기록 |
| 전체 태스크 | 모든 청크 실패 | task.status = "failed" |
| 전체 태스크 | 일부만 성공 | task.status = "completed", result에 집계 |

## Files to Modify

| 파일 | 변경 |
|------|------|
| `agent/src/agent.ts` | `executeYouTubeTask()` 추가, youtube 분기 |
| `agent/src/broadcaster.ts` | `broadcastTaskProgress()` 추가 |
| `scripts/youtube_watch.js` | stub → 기본 시청 구현 |
| `components/tasks-page.tsx` | RegisterTaskDialog 제출 완성, TaskItem 진행률 |
| `lib/mappers.ts` | progress 계산을 result 기반으로 |

## Success Criteria

- [Dashboard] 태스크 생성: 'Watch video xyz' → 20대 디바이스
- [Agent] 태스크 수신 (broadcast or poll)
- [Agent] 각 디바이스 YouTube 실행 → 스크립트 → 시청 중 진행률
- [Agent] 태스크 완료: 20/20 성공
- [DB] tasks.status = 'completed', task_devices 20행 done
- [Dashboard] 진행률 실시간 표시 (5/20, 10/20, ...)
