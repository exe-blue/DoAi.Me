# UltraQA - Phase별 기능 테스트

각 Phase 완료 후 해당 체크리스트를 실행하여 기능 단위 테스트를 수행합니다.

## 실행 방법

1. **Phase N 완료** 후 `tests/ultraqa/phase-N.md` 체크리스트 확인
2. **API 테스트** (선택): `npm run test:api` (개발 서버 실행 중)
3. **수동 체크**: 각 항목 ✓ 확인

## Phase별 파일

| Phase | 파일 | 주요 검증 항목 |
|-------|------|---------------|
| 1 | phase-1.md | DB 마이그레이션, 빌드 |
| 2 | phase-2.md | 채널/영상 API, YouTube 연동 |
| 3 | phase-3.md | 태스크 API, Agent-Xiaowei |
| 4 | phase-4.md | 스케줄, 크론 모니터링 |
| 5 | phase-5.md | 대시보드, Realtime |
| 6 | phase-6.md | 에러 핸들링, E2E |
