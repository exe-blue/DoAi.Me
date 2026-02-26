# UltraQA — Phase 1: 기반 설정

## 전제 조건

- [ ] Supabase 프로젝트 생성 완료
- [ ] `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 설정

## 체크리스트

### DB 마이그레이션

- [ ] `00001_initial_schema.sql` 적용 완료
- [ ] `00002_channels_videos_schedules.sql` 적용 완료
- [ ] `channels` 테이블 존재
- [ ] `videos` 테이블 존재
- [ ] `schedules` 테이블 존재
- [ ] `tasks` 테이블에 `video_id`, `channel_id`, `task_type` 컬럼 존재

### 빌드

- [ ] `npm install` 성공
- [ ] `npm run build` 성공
- [ ] `npm run dev` 실행 후 `http://localhost:3000` 접속 가능

### API

- [ ] `GET /api/health` → `{ "status": "ok" }` 응답
