# ADR-002: 디바이스 디스커버리 파이프라인

**Status**: Accepted
**Date**: 2026-02-13
**Deciders**: exe-blue 팀

---

## Context

500대의 Galaxy S9 디바이스 상태를 실시간으로 파악하고, 오류 상태의 디바이스를 신속하게 감지해야 했습니다. 기존에는 수동으로 디바이스 상태를 확인해야 했고, 연결 끊김이나 오류 상태를 즉시 알 수 없었습니다.

### 주요 요구사항
- 디바이스 연결 상태 실시간 모니터링
- 오류 상태 디바이스 자동 감지
- 대시보드에서 500대 디바이스 그리드 표시
- Broadcast 기반 실시간 UI 업데이트

## Decision

### 1. Approach B 채택: Agent 주도 + Broadcast 기반

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent (Node PC)                          │
│  ┌─────────────┐     ┌─────────────┐     ┌──────────────┐  │
│  │  Heartbeat  │ ──► │  Xiaowei    │ ──► │  Supabase    │  │
│  │  (30초)     │     │  list API   │     │  UPSERT      │  │
│  └─────────────┘     └─────────────┘     └──────┬───────┘  │
└─────────────────────────────────────────────────│───────────┘
                                                  │
                          ┌───────────────────────▼───────────┐
                          │      Supabase Broadcast           │
                          │      room:devices (update)        │
                          └───────────────────────┬───────────┘
                                                  │
                          ┌───────────────────────▼───────────┐
                          │      Dashboard UI                  │
                          │      useDevicesBroadcast()        │
                          └───────────────────────────────────┘
```

### 2. 오류 상태 감지 로직

Agent의 heartbeat 루프에서 Xiaowei `list` API 응답 분석:
- `status: 'online'` → 정상
- `status: 'offline'` → 연결 끊김
- `status: 'error'` 또는 응답 없음 → 오류

### 3. Broadcast 이벤트 통일

- **채널명**: `room:devices`
- **이벤트 타입**: `update` (INSERT/UPDATE 통합)
- **페이로드**: 변경된 디바이스 정보

## Consequences

### Positive
- 30초 주기로 500대 디바이스 상태 자동 동기화
- Broadcast 기반 효율적인 UI 업데이트 (polling 불필요)
- 오류 디바이스 즉시 감지 및 표시

### Negative
- Agent 다운 시 해당 Node PC의 디바이스 상태 갱신 중단
- 30초 간격으로 인한 지연 (실시간 감지는 아님)

### Mitigations
- `mark-stale-workers-offline` pg_cron 작업: 5분 이상 heartbeat 없으면 offline 처리
- `cleanup-stale-devices` pg_cron 작업: 7일 이상 미접속 디바이스 정리

## Implementation

### 주요 파일

| 파일 | 역할 |
|------|------|
| `agent/heartbeat.js` | 30초 주기 디바이스 동기화 |
| `agent/supabase-sync.js` | devices 테이블 UPSERT + Broadcast |
| `hooks/use-realtime.ts` | `useDevicesBroadcast()` 훅 |
| `components/devices-page.tsx` | 500대 디바이스 그리드 UI |

### syncDevices 핵심 로직

```javascript
// agent/supabase-sync.js
async syncDevices(deviceList) {
  const errorSerials = deviceList
    .filter(d => d.status === 'error')
    .map(d => d.serial);

  // Supabase UPSERT
  await this.supabase
    .from('devices')
    .upsert(deviceList, { onConflict: 'serial' });

  // Broadcast 발행
  await this.channel.send({
    type: 'broadcast',
    event: 'update',
    payload: { devices: deviceList, errorSerials }
  });
}
```

## Related

- **Commits**:
  - `24be21b` feat(agent): add error serials support to syncDevices()
  - `b83a3fb` feat(agent): detect device error state in heartbeat loop
  - `d68ff29` feat(dashboard): add useDevicesBroadcast() hook
  - `df87122` feat(dashboard): incremental device updates via broadcast
- **Documents**:
  - `docs/plans/2026-02-13-device-discovery-pipeline-design.md`
  - `docs/plans/2026-02-13-device-discovery-pipeline-plan.md`
