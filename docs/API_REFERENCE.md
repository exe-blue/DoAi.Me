# DoAi.Me — API 명세서

> 최종 수정: 2026-02-26  
> Stack: Next.js App Router (Vercel Serverless)  
> Auth: Supabase Session / x-api-key / Bearer (CRON)

---

## 인증 방식

| 방식 | 사용처 | 설명 |
|------|--------|------|
| **Session** | 대부분의 API | Supabase Auth 세션 (쿠키) |
| **x-api-key** | `/api/tasks` POST 등 | Agent/외부가 API Key로 호출 |
| **Bearer** | `/api/cron/*` | `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron) |
| **None** | `/api/health`, `/api/commands/presets` | 인증 불필요 |

---

## 1. 대시보드 (`/api/dashboard/`)

| Method | Path | 설명 | Query |
|--------|------|------|-------|
| GET | `/api/dashboard/realtime` | 실시간 상태 (기기, 통계, PC 목록) | — |
| GET | `/api/dashboard/missions` | 일별 미션 리포트 (영상별 달성률) | `?date=YYYY-MM-DD` |
| GET | `/api/dashboard/errors` | 에러 유형별 요약 | `?hours=24` |
| GET | `/api/dashboard/accounts` | 계정 풀 건강도 | — |
| GET | `/api/dashboard/proxies` | 프록시 풀 건강도 | — |
| GET | `/api/dashboard/screenshots` | 작업 타임라인 + 스크린샷 경로 | `?date=YYYY-MM-DD`, `?serial=` |

---

## 2. 워커 (`/api/workers/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workers` | 워커 목록 (디바이스 수 포함) |
| GET | `/api/workers/[id]` | 워커 상세 (소속 디바이스 포함) |
| POST | `/api/workers/heartbeat` | 하트비트 (워커 + 디바이스 upsert) |

---

## 3. 디바이스 (`/api/devices/`)

| Method | Path | 설명 | Query / Body |
|--------|------|------|--------------|
| GET | `/api/devices` | 디바이스 목록 | `?worker_id=`, `?status=` |
| GET | `/api/devices/[id]` | 디바이스 상세 | — |
| PUT | `/api/devices/[id]` | 디바이스 수정 | — |
| DELETE | `/api/devices/[id]` | 디바이스 삭제 | — |
| POST | `/api/devices/command` | 디바이스 명령 등록 (command_logs) | Body: `device_ids`, `command_type`, `options?` |

**POST /api/devices/command**  
- `command_type`: `reboot` \| `clear_cache` \| `kill_app` \| `screenshot` \| `enable` \| `disable` \| `set_proxy` \| `clear_proxy`  
- `set_proxy` 시 `options.proxy` (address, username, password) 등 전달 가능. Agent가 command_logs를 폴링해 실행.

---

## 4. 태스크 (`/api/tasks/`)

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/tasks` | 태스크 목록 | Session |
| POST | `/api/tasks` | 태스크 생성 (수동/배치) | Session or x-api-key |
| PATCH | `/api/tasks` | 태스크 상태 업데이트 | Session |
| DELETE | `/api/tasks` | 태스크 삭제 | Session |
| GET | `/api/tasks/[id]/devices` | 태스크에 할당된 디바이스 목록 | Session |
| POST | `/api/tasks/[id]/retry` | 실패 디바이스 재시도 (새 태스크 생성) | Session |

---

## 5. 큐 (`/api/queue/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/queue` | 큐 항목 목록 |
| POST | `/api/queue` | 큐 항목 생성 |
| DELETE | `/api/queue` | 벌크 취소 |
| PUT | `/api/queue/[id]` | 우선순위/설정 변경 |
| DELETE | `/api/queue/[id]` | 큐 항목 취소 |

**MVP 최소 경로 (대시보드 없이 영상 인젝션 → 시청 완료)**: [MINIMAL_MVP.md](MINIMAL_MVP.md) 참고. `POST /api/queue` 최소 body 스펙과 채널/영상 준비 방법 정리.

---

## 6. 스케줄 (`/api/schedules/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/schedules` | 스케줄 목록 |
| POST | `/api/schedules` | 스케줄 생성 (cron 표현식) |
| PUT | `/api/schedules/[id]` | 스케줄 수정 |
| DELETE | `/api/schedules/[id]` | 스케줄 삭제 |
| POST | `/api/schedules/[id]/trigger` | 수동 트리거 → task_queue 삽입 |

---

## 7. 프리셋 (`/api/presets/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/presets` | 프리셋 목록 |
| POST | `/api/presets` | 프리셋 생성 |
| GET | `/api/presets/[id]` | 프리셋 상세 |
| PUT | `/api/presets/[id]` | 프리셋 수정 |
| DELETE | `/api/presets/[id]` | 프리셋 삭제 |

---

## 8. 프록시 (`/api/proxies/`)

| Method | Path | 설명 | Query / Body |
|--------|------|------|--------------|
| GET | `/api/proxies` | 프록시 목록 (페이지네이션) | `?page=`, `?pageSize=`, `?q=`, `?status=`, `?assigned=true\|false` |
| POST | `/api/proxies` | 프록시 1건 생성. Body에 `raw`(IP:PORT:ID:PW) 또는 `address` 등 | — |
| DELETE | `/api/proxies` | 벌크 삭제 (Body: id 배열) | — |
| PUT | `/api/proxies/[id]` | 프록시 수정 (address, type, status, worker_id) | — |
| DELETE | `/api/proxies/[id]` | 프록시 삭제 (할당된 프록시는 해제 후 삭제 가능) | — |
| POST | `/api/proxies/assign` | 프록시 ↔ 디바이스 할당/해제 | Body: `proxy_id`, `device_id` (null이면 해제) |
| POST | `/api/proxies/[id]/swap` | 프록시 교체 (old → new) | — |
| POST | `/api/proxies/auto-assign` | 미할당 프록시 ↔ 미할당 디바이스 1:1 자동 매핑 + set_proxy 명령 등록 | Body: `pc_id`/`worker_id?`, `limit?` |
| POST | `/api/proxies/bulk` | 텍스트에서 벌크 프록시 추가 (한 줄에 `host:port` 또는 `host:port:user:pass`) | Body: `proxies[]`, `type?`, `worker_id?` |
| PATCH | `/api/proxies/bulk` | 벌크 프록시 worker 할당 등 | — |

---

## 9. 계정 (`/api/accounts/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/accounts` | 계정 목록 |
| POST | `/api/accounts` | 계정 생성 |
| GET | `/api/accounts/[id]` | 계정 상세 |
| PUT | `/api/accounts/[id]` | 계정 수정 |

---

## 10. 채널 (`/api/channels/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/channels` | 채널 목록 (영상 포함) |
| POST | `/api/channels` | 채널 생성 |
| GET | `/api/channels/[id]` | 채널 상세 (영상 포함) |
| PUT | `/api/channels/[id]` | 채널 수정 |
| DELETE | `/api/channels/[id]` | 채널 삭제 |
| GET | `/api/channels/[id]/videos` | 채널의 영상 목록 |
| POST | `/api/channels/[id]/videos` | 영상 생성 |
| DELETE | `/api/channels/[id]/videos` | 영상 벌크 삭제 |
| PUT | `/api/channels/[id]/videos/[videoId]` | 영상 수정 |

---

## 11. YouTube (`/api/youtube/`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/youtube/channels` | 채널 등록 |
| GET | `/api/youtube/channels` | 채널 핸들 resolve / 목록 |
| DELETE | `/api/youtube/channels` | 채널 삭제 |
| PATCH | `/api/youtube/channels` | 모니터링 설정 변경 |
| GET | `/api/youtube/sync` | 모니터링 채널 전체 동기화 |
| GET | `/api/youtube/videos` | 채널 최근 영상 조회 (`?channelId=`, `?hours=`) |
| POST | `/api/youtube/register-channels` | 여러 채널 일괄 등록 + 영상 수집 |
| POST | `/api/youtube/pipeline` | 파이프라인 실행 |
| POST | `/api/youtube/deploy` | 배포 관련 |
| GET | `/api/youtube/deploy` | 배포 상태 등 |
| POST | `/api/youtube/command` | YouTube 관련 명령 |
| POST | `/api/youtube/warmup` | 워밍업 |
| POST | `/api/youtube/full-engage` | 풀 참여 실행 |
| GET | `/api/youtube/actions` | 액션 목록 등 |

---

## 12. 스크립트·워크플로 (`/api/scripts/`, `/api/workflows/`)

### 스크립트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/scripts` | 스크립트 목록 |
| POST | `/api/scripts` | 스크립트 생성 |
| GET | `/api/scripts/[id]` | 스크립트 상세 |
| PATCH | `/api/scripts/[id]` | 스크립트 수정 |
| POST | `/api/scripts/[id]/versions` | 버전 생성 |
| POST | `/api/scripts/[id]/archive` | 아카이브 |
| POST | `/api/scripts/[id]/activate` | 활성화 |

### 워크플로

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workflows` | 워크플로 목록 |
| POST | `/api/workflows` | 워크플로 생성 |
| GET | `/api/workflows/[id]` | 워크플로 상세 |
| PATCH | `/api/workflows/[id]` | 워크플로 수정 |
| POST | `/api/workflows/[id]/versions` | 버전 생성 |

---

## 13. 명령·크론·기타

### 명령

| Method | Path | 설명 | Query |
|--------|------|------|-------|
| GET | `/api/commands/presets` | 명령 프리셋 목록 | None (인증 불필요) |
| GET | `/api/commands` | 명령 로그 목록 | `?page=`, `?pageSize=`, `?before=` |
| POST | `/api/commands` | 명령 생성 (target_type, target_serials, command 등) | Session |
| GET | `/api/commands/[id]` | 명령 로그 상세 | Session |

### 크론 (Bearer)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/cron/sync-channels` | 채널 자동 동기화 (1분 주기) |
| GET | `/api/cron/dispatch-queue` | 큐 디스패치 |

### 앱에서 호출하는 동기화·디스패치

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/sync-channels` | 채널 동기화 수동 실행 |
| POST | `/api/dispatch-queue` | 큐 디스패치 수동 실행 |

### 기타

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/health` | 헬스체크 (`?report=true` 시 상세) | None |
| GET | `/api/stats` | 시스템 통계 (워커, 기기, 태스크, 채널) | Session |
| GET | `/api/overview` | 대시보드 개요 통계 | Session |
| GET | `/api/logs` | 태스크 로그 | `?task_id=`, `?level=`, `?search=` |
| GET | `/api/settings` | 시스템 설정 조회 | Session |
| PUT | `/api/settings` | 설정 벌크 업데이트 | Session |
| GET | `/api/agents/[pcNumber]/health` | PC(에이전트) 헬스 (heartbeat, deviceCount 등) | Session |

---

## 응답 형식

- 성공: `NextResponse.json({ success: true, data?: T })` 또는 `{ data: T[], page, pageSize, total }` (목록)
- 실패: `{ success: false, error: string, code?: string }` + 적절한 HTTP 상태 코드

---

## 요약

| 구분 | 엔드포인트 수 (대략) |
|------|----------------------|
| 메인 앱 (`app/api/`) | 70+ |
| 인증 | Session 기본, x-api-key(tasks 등), Bearer(cron) |
