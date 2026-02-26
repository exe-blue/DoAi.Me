# UltraQA — Phase 3: 태스크 시스템

## 전제 조건

- [ ] Phase 2 완료
- [ ] Agent 실행 환경 (Xiaowei `ws://127.0.0.1:22222/` 또는 목)

## 체크리스트

### 태스크 API

- [ ] `POST /api/tasks` — 태스크 생성 (즉시/예약)
- [ ] `GET /api/tasks` — 태스크 목록 (필터: status, video_id, channel_id)
- [ ] `GET /api/tasks/[id]` — 태스크 상세 + 로그
- [ ] `PUT /api/tasks/[id]/cancel` — 태스크 취소
- [ ] `GET /api/tasks/[id]/logs` — 태스크별 로그

### Agent

- [ ] Agent가 Supabase Realtime으로 tasks 구독
- [ ] pending tasks 감지 시 Xiaowei 호출
- [ ] task_logs에 실행 로그 저장
- [ ] 태스크 상태: pending → running → completed/failed

### 동시 실행

- [ ] device_count max 20 준수
- [ ] 가용 디바이스 부족 시 대기
