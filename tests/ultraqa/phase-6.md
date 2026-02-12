# UltraQA — Phase 6: 안정화

## 전제 조건

- [ ] Phase 5 완료

## 체크리스트

### 에러 핸들링

- [ ] API 4xx/5xx 적절한 JSON 응답
- [ ] `PUT /api/tasks/[id]/retry` — 태스크 재시도

### Agent

- [ ] Xiaowei WebSocket 끊김 시 재연결 (exponential backoff)
- [ ] 재연결 후 미완료 태스크 복구

### E2E

- [ ] 채널 등록 → 영상 수동 등록 → 태스크 생성 → 완료 (전체 플로우)
- [ ] 새 영상 자동 감지 → 태스크 자동 생성 → 완료
