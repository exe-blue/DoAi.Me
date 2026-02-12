# UltraQA — Phase 5: 대시보드 & 실시간

## 전제 조건

- [ ] Phase 4 완료

## 체크리스트

### 통계 API

- [ ] `GET /api/stats` — 채널 수, 대기 태스크, 활성 디바이스, 오늘 완료 수

### 로그

- [ ] `GET /api/logs` — 전체 로그 (검색, 필터)
- [ ] `GET /api/logs/stream` — SSE 실시간 로그 (선택)

### Realtime UI

- [ ] 대시보드 StatsCards 실데이터 표시
- [ ] tasks 변경 시 UI 자동 업데이트 (Supabase Realtime)
- [ ] devices 변경 시 UI 자동 업데이트
- [ ] 디바이스 그리드 (idle/busy/error 색상)
