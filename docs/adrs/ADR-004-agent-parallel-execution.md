# ADR-004: Agent Parallel Execution Engine

**Status**: Accepted
**Date**: 2026-02-14
**Deciders**: Development Team
**Related Commits**: `6e85dcd`, `2307d7a`, `0db8c9c`

---

## Context

500대의 Galaxy S9 디바이스에서 YouTube 시청 태스크를 효율적으로 실행해야 합니다. 기존 방식의 문제점:

1. **순차 실행**: 디바이스당 하나씩 순차 처리로 처리 시간 증가
2. **진행률 추적 부재**: 전체 태스크의 진행 상황 파악 불가
3. **오류 복구 어려움**: 특정 디바이스 실패 시 전체 태스크 영향

## Decision

### 1. 청크 기반 병렬 실행 엔진

```
500 devices → 25 chunks (chunk_size=20)
            ↓
┌─────────────────────────────────────────┐
│  Chunk 1: devices[0:19]   → 병렬 실행   │
│  Chunk 2: devices[20:39]  → 대기        │
│  ...                                    │
│  Chunk 25: devices[480:499] → 대기      │
└─────────────────────────────────────────┘
            ↓
Chunk 1 완료 → Chunk 2 시작 → ...
```

### 2. 디바이스별 진행 추적

```typescript
interface TaskProgress {
  total_devices: number;
  completed_devices: number;
  failed_devices: number;
  current_chunk: number;
  total_chunks: number;
  per_device: {
    [serial: string]: {
      status: 'pending' | 'running' | 'completed' | 'failed';
      started_at?: Date;
      completed_at?: Date;
      error?: string;
    }
  }
}
```

### 3. Broadcast 진행률 업데이트

각 청크 완료 시 `room:task:<id>:progress` 토픽으로 진행률 전송:

```javascript
// agent/task-executor.js
async function executeChunk(devices, taskId) {
  const results = await Promise.allSettled(
    devices.map(device => executeOnDevice(device, taskId))
  );

  await broadcastProgress(taskId, {
    completed: results.filter(r => r.status === 'fulfilled').length,
    failed: results.filter(r => r.status === 'rejected').length
  });
}
```

### 4. E2E 검증 파이프라인

- `tests/e2e-local.js`: 전체 파이프라인 검증
- Script Verifier: AutoJS 스크립트 실행 전 검증
- Execution Stats: 실행 통계 수집

## Consequences

### Positive

- 병렬 처리로 총 실행 시간 단축
- 실시간 진행률 모니터링
- 개별 디바이스 실패가 전체 태스크에 영향 없음

### Negative

- 동시 실행 디바이스 수 제한 필요 (Xiaowei 부하)
- 복잡한 오류 처리 로직

## Implementation

```
agent/
├── task-executor.js      # 청크 기반 실행
├── youtube-executor.js   # YouTube 특화 실행
├── broadcaster.js        # 진행률 Broadcast
└── stats-collector.js    # 실행 통계
```

### 설정

```env
# agent/.env
CHUNK_SIZE=20              # 동시 실행 디바이스 수
CHUNK_INTERVAL=2000        # 청크 간 대기 시간 (ms)
MAX_RETRY_PER_DEVICE=3     # 디바이스당 최대 재시도
```

---

## References

- Commits: `6e85dcd` (parallel engine), `2307d7a` (E2E pipeline), `0db8c9c` (broadcast progress)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 3
