# Agent Electron — 인수 기준 체크리스트

계획서 "최종 인수 기준(운영 시나리오)"에 따른 검증 항목.

| # | 시나리오 | 확인 방법 | 비고 |
|---|----------|-----------|------|
| 1 | PC 재부팅/앱 재시작 시 running 작업이 30분 기준으로 정리되고 정상 재개 | StaleCleaner 복구 + 주기 타임아웃 동작, 재시작 후 claim 재개 | StaleCleaner 30분/5분 구현됨 |
| 2 | 네트워크 끊김 시 Realtime 끊겨도 Polling으로 진행 | QueueDispatcher 30초 폴링, DeviceOrchestrator 3초 폴링만 사용 | Realtime 미연결 시에도 폴링만으로 동작 |
| 3 | RPC 불일치 시 claim RPC가 fallback으로 동작 | claimTaskDevice: runner_pc_name → runner_pc_id → claim_next_task_device 순서 | rpc.ts 호환 레이어 구현됨 |
| 4 | OpenAI 장애 시 댓글 생성 실패해도 실행 진행 | TaskExecutor: comment_status ready 사용, 없으면 fallback(stub) | 실행은 진행, 댓글만 fallback |
| 5 | config.json 수정만으로 연결정보/pcNumber 반영(재빌드 불필요) | userData/config.json 저장 + UI에서 IPC config:set | Phase A/D 반영 |
| 6 | GitHub Release 후 클라이언트가 업데이트 수신·적용 | electron-updater checkForUpdatesAndNotify, 태그 푸시 시 CI 빌드·릴리즈 | workflow agent-electron-release.yml |

## 구현 상태 요약

- **Phase A**: config.json, electron-log, Supabase 검증·PC 등록, Xiaowei 연결(타임아웃), graceful shutdown.
- **Phase B**: StaleTaskCleaner(복구+주기), QueueDispatcher(30초), DeviceOrchestrator(3초, per-serial 직렬).
- **Phase C**: TaskExecutor watch duration clamp(15s–20m), comment ready/fallback, 디바이스 단위 직렬.
- **Phase D**: UI(설정 저장), electron-updater, CI(태그 → 빌드·릴리즈).

실제 YouTube 시청 흐름(Xiaowei 명령)은 agent 레거시를 참조해 Phase C에서 확장 가능.
