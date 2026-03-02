# Dashboard assumptions and TODOs

Materio rebuild: assumption fields and stub/TODO list. No new API or DB changes.

## KPI (Operations)

- **last_heartbeat_time**: Derived from workers API when available; otherwise —.
- **recent_success_count**, **recent_failure_count**: API 없음 → stub (0). TODO when API exists.

## Alerts (Operations)

- **heartbeat_mismatch**, **unauthorized**, **recent_failures**: 전부 API 없음 → stub (empty array). TODO.

## Search (Operations)

- PC number / serial / IP filter: UI only. TODO: connect when API supports query params.

## Channels (YouTube)

- **last_collected_at**, **collection_status**: Use from API response when present; otherwise assumption/stub.
- Register / disable / delete: Connect when existing API is used; otherwise disabled + TODO.

## Contents (YouTube)

- **GET /api/videos** list: Contents come from GET /api/channels (same response has `contents`). If needed later, GET /api/youtube/videos with channelId can be used.
- Content create form: UI only; submit disabled + TODO until create API is available.

## Events / Logs

- **getLogs**: Uses GET /api/logs; level/search params as per API.
- **getErrors**: Uses GET /api/dashboard/errors.
- **Single log detail**: No single-log API → getLogDetail() stub + TODO. When API exists, wire GET by id.

## Settings

- Environment display: NEXT_PUBLIC_* only (masked). Save/update: no API → TODO; button hidden or disabled.
