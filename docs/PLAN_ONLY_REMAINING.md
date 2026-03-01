# 계획으로만 남은 항목 점검 (2026-03)

> `docs/IMPLEMENTATION_PLAN.md`, `docs/IMPLEMENTATION_PLAN_V2.md` 기준.  
> 현재 구조: `apps/web` (Next.js), `apps/desktop` (Electron), `_archive/agent-legacy` (레거시 Agent).

## IMPLEMENTATION_PLAN_V2.md — 미구현/계획만

| 항목 | 내용 | 비고 |
|------|------|------|
| **P0-1** | Xiaowei 네트워크 스캔 + IP:5555 재연결 | agent는 _archive, Electron 앱에서 Xiaowei 연동 |
| **P0-2** | 프록시 자동 할당 + 상태 3종 | API/대시보드 구조에 따라 별도 구현 |
| **P1-1** | 시청 후 스크린샷 자동 저장 + 웹 뷰어 | desktop 스크린샷 저장은 구현됨(C:\client 등) |
| **P1-2** | 영상 워밍업 (AI 키워드 + 랜덤 시청) | 미구현 |
| **P1-3** | 랜덤 타이밍 강화 | agent 레거시에 일부 있음, 전면 적용은 미완 |
| **P1-4** | Google 계정 비밀번호 보안 저장 (Vault) | 미구현 |
| **P2-1** | YouTube Data API 자동 콘텐츠 수집 강화 | sync-channels 등 일부 있음, 강화는 미완 |
| **P2-2** | 작업 타임라인 웹 UI | 미구현 |
| **P3-1** | AI 기반 프로세스 최적화 | 계획만 |
| **P3-2** | Xiaowei 네트워크 스캔 자동화 | 계획만 |

## IMPLEMENTATION_PLAN.md (Phase 1–6)

- Phase 1–6 작업 항목 중 상당수는 **이미 반영됨** (channels, videos, schedules, tasks API, Realtime 등).
- **미반영/구조 차이**: 플랜이 `agent/src/*.ts`, `app/` 단일 앱 기준이었고, 현재는 `apps/web` + `apps/desktop`, agent는 `_archive/agent-legacy`로 보관.  
  → agent 관련 항목은 Electron/desktop 또는 별도 서비스로 이전 시 해당 플랜 참고.

## 요약

- **구현됨**: 채널/영상/태스크/스케줄 API, 대시보드(ops/channels/events), desktop 설치·자동실행·스크린샷.
- **계획만 남음**: P0/P1/P2/P3 상세(프록시 자동할당, 워밍업, 타임라인 UI, AI 최적화 등) — 필요 시 우선순위 정해 단계별 구현.
