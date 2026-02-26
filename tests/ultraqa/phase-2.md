# UltraQA — Phase 2: 채널/영상 관리

## 전제 조건

- [ ] Phase 1 완료
- [ ] `.env.local`에 `YOUTUBE_API_KEY` 설정 (YouTube Data API v3)

## 체크리스트

### 채널 API

- [ ] `POST /api/channels` — YouTube URL로 채널 등록 → 채널 정보 자동 수집
- [ ] `GET /api/channels` — 채널 목록 조회
- [ ] `GET /api/channels/[id]` — 채널 상세
- [ ] `PUT /api/channels/[id]` — 채널 설정 수정
- [ ] `DELETE /api/channels/[id]` — 채널 삭제
- [ ] `POST /api/channels/[id]/sync` — 채널 정보 수동 동기화

### 영상 API

- [ ] `POST /api/videos` — 영상 URL로 수동 등록
- [ ] `GET /api/videos` — 영상 목록 (필터: channel_id, status)
- [ ] `GET /api/videos/[id]` — 영상 상세
- [ ] `DELETE /api/videos/[id]` — 영상 삭제

### UI

- [ ] 채널 등록 폼: URL 입력 → 정보 수집 → 저장
- [ ] 채널 카드 목록 표시
- [ ] 영상 수동 등록
- [ ] 영상 목록 필터
