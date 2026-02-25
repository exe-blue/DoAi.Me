# 메뉴 ↔ API 매핑 요약표

| 메뉴 | 경로 | 주요 API |
|------|------|----------|
| 대시보드 | `/dashboard` | `/api/dashboard/realtime`, `/api/overview`, `/api/stats`, `/api/health` |
| PC | `/dashboard/workers` | `/api/workers`, `/api/workers/[id]` |
| 디바이스 | `/dashboard/devices` | `/api/devices`, `/api/devices/[id]` |
| 네트워크 | `/dashboard/network` | `/api/dashboard/proxies`, `/api/health?report=true` |
| 프록시 | `/dashboard/proxies` | `/api/proxies`, `/api/proxies/bulk`, `/api/proxies/assign`, `/api/proxies/auto-assign` |
| 채널 | `/dashboard/channels` | `/api/channels`, `/api/youtube/channels`, `/api/youtube/sync` |
| 콘텐츠 | `/dashboard/content` | `/api/youtube/videos`, `/api/channels/[id]/videos`, `/api/tasks` |
| 대기열 | `/dashboard/tasks` | `/api/tasks`, `/api/tasks/[id]/devices`, `/api/tasks/[id]/retry` |
| 완료 | `/dashboard/completed` | `/api/dashboard/screenshots` |
| 작업관리 | `/dashboard/tasks` | `/api/queue`, `/api/tasks` |
| 명령모듈 | `/dashboard/presets` | `/api/presets` |
| ADB콘솔 | `/dashboard/adb` | `/api/commands/presets`, `/api/commands` |
| 로그 | `/dashboard/logs` | `/api/logs` |
| 에러 | `/dashboard/errors` | `/api/dashboard/errors` |
| 설정 | `/dashboard/settings` | `/api/settings`, `/api/schedules` |
