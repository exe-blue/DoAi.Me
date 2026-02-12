# UltraQA — Phase 4: 스케줄링 & 모니터링

## 전제 조건

- [ ] Phase 3 완료
- [ ] Vercel Cron 또는 Supabase Edge Function 설정 가능

## 체크리스트

### 스케줄 API

- [ ] `POST /api/schedules` — 스케줄 생성
- [ ] `GET /api/schedules` — 스케줄 목록
- [ ] `PUT /api/schedules/[id]` — 스케줄 수정
- [ ] `DELETE /api/schedules/[id]` — 스케줄 삭제
- [ ] `PUT /api/schedules/[id]/toggle` — 활성/비활성 토글

### 채널 모니터링

- [ ] 크론/Edge Function 호출 시 채널 최신 영상 조회
- [ ] 새 영상 감지 → videos INSERT (auto_detected=true)
- [ ] 활성 스케줄에 따라 tasks 자동 생성

### UI

- [ ] 스케줄 CRUD UI
- [ ] 트리거 유형: on_upload / interval / cron
