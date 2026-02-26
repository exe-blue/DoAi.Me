# DoAi.Me — API 명세서

> 생성일: 2026-02-25
> Stack: Next.js App Router (Vercel Serverless)
> Auth: Supabase Session / x-api-key / Bearer Token

---

## 인증 방식

| 방식 | 사용처 | 설명 |
|------|--------|------|
| **Session** | 대부분의 API | `createServerClient()` → Supabase Auth 세션 |
| **x-api-key** | `/api/tasks` POST | Agent가 API Key로 태스크 생성 |
| **Bearer Token** | `/api/cron/sync-channels` | Vercel Cron용 `CRON_SECRET` |
| **None** | `/api/health`, `/api/commands/presets` | 인증 불필요 |

---

## 1. 대시보드 (`/api/dashboard/`)

| Method | Path | 설명 | Query |
|--------|------|------|-------|
| GET | `/api/dashboard/realtime` | 실시간 상태 (기기, 통계, PC 목록) | — |
| GET | `/api/dashboard/missions` | 일별 미션 리포트 (영상별 달성률) | `?date=2026-02-25` |
| GET | `/api/dashboard/errors` | 에러 유형별 요약 | `?hours=24` |
| GET | `/api/dashboard/accounts` | 계정 풀 건강도 | — |
| GET | `/api/dashboard/proxies` | 프록시 풀 건강도 | — |

---

## 2. 워커 (`/api/workers/`)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/workers` | 워커 목록 (디바이스 수 포함) |
| GET | `/api/workers/[id]` | 워커 상세 (소속 디바이스 포함) |
| POST | `/api/workers/heartbeat` | 하트비트 (워커 + 디바이스 upsert) |

---

## 3. 디바이스 (`/api/devices/`)

| Method | Path | 설명 | Query |
|--------|------|------|-------|
| GET | `/api/devices` | 디바이스 목록 | `?worker_id=`, `?status=` |
| GET | `/api/devices/[id]` | 디바이스 상세 | — |
| PUT | `/api/devices/[id]` | 디바이스 수정 | — |
| DELETE | `/api/devices/[id]` | 디바이스 삭제 | — |

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

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/proxies` | 프록시 목록 |
| POST | `/api/proxies` | 프록시 생성 |
| DELETE | `/api/proxies` | 벌크 삭제 |
| PUT | `/api/proxies/[id]` | 프록시 수정 |
| DELETE | `/api/proxies/[id]` | 프록시 삭제 (디바이스 해제) |
| POST | `/api/proxies/assign` | 프록시 ↔ 디바이스 할당/해제 |
| POST | `/api/proxies/[id]/swap` | 프록시 교체 (old → new) |
| POST | `/api/proxies/auto-assign` | 미할당 프록시 → 미할당 디바이스 자동 매핑 |
| POST | `/api/proxies/bulk` | 텍스트에서 벌크 프록시 추가 |
| PATCH | `/api/proxies/bulk` | 벌크 프록시 워커 할당 |

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

## 11. YouTube API (`/api/youtube/`)

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/youtube/channels` | 채널 등록 |
| GET | `/api/youtube/channels` | 채널 핸들 resolve |
| DELETE | `/api/youtube/channels` | 채널 삭제 |
| PATCH | `/api/youtube/channels` | 모니터링 설정 변경 |
| GET | `/api/youtube/sync` | 모니터링 채널 전체 동기화 |
| GET | `/api/youtube/videos` | 채널 최근 영상 조회 (`?channelId=`, `?hours=`) |
| POST | `/api/youtube/register-channels` | 여러 채널 일괄 등록 + 영상 수집 |

---

## 12. 기타

| Method | Path | 설명 | Auth |
|--------|------|------|------|
| GET | `/api/health` | 헬스체크 / 상세 리포트 (`?report=true`) | None |
| GET | `/api/stats` | 시스템 통계 (워커, 기기, 태스크, 채널) | Session |
| GET | `/api/overview` | 대시보드 개요 통계 | Session |
| GET | `/api/logs` | 태스크 로그 (`?task_id=`, `?level=`, `?search=`) | Session |
| GET | `/api/settings` | 시스템 설정 조회 | Session |
| PUT | `/api/settings` | 설정 벌크 업데이트 | Session |
| GET | `/api/commands/presets` | 명령 프리셋 목록 | None |
| GET | `/api/commands` | 명령 로그 목록 | Session |
| POST | `/api/commands` | 명령 생성 | Session |
| GET | `/api/commands/[id]` | 명령 로그 상세 | Session |
| GET | `/api/cron/sync-channels` | 크론: 채널 자동 동기화 (1분 주기) | Bearer |

---

## 13. Dashboard App (`apps/dashboard/`)

> WIP 보조 대시보드 (port 3001). 메인 앱의 서브셋.

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/presets` | 프리셋 목록 (`?category=`) |
| POST | `/api/presets` | 프리셋 생성 |
| GET | `/api/devices` | 디바이스 목록 (`?worker_id=`, `?status=`, `?tag_group=`) |
| GET | `/api/tasks` | 태스크 목록 (페이지네이션) |
| POST | `/api/tasks` | 태스크 생성 |
| GET | `/api/tasks/[id]` | 태스크 상세 (디바이스 진행 포함) |
| PATCH | `/api/tasks/[id]` | 태스크 상태 변경 |
| GET | `/api/accounts` | 계정 목록 (`?status=`) |
| PATCH | `/api/accounts` | 계정 상태 변경 |
| GET | `/api/workers` | 워커 요약 목록 |
| POST | `/api/workers` | 워커 하트비트 |
| GET | `/api/stats` | 대시보드 통계 (뷰) |

---

## 요약

| 구분 | 파일 수 | 엔드포인트 수 |
|------|--------|-------------|
| 메인 앱 (`app/api/`) | 45 | ~80 |
| 대시보드 앱 | 7 | ~14 |
| **합계** | **52** | **~94** |

응답 형식: `NextResponse.json({ success: boolean, data?: any, error?: string })`
