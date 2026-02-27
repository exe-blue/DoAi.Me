# 구현 계획 v2 — 프로덕션 배포 전 필수 기능

> 우선순위: P0(배포 차단) > P1(1주 내) > P2(2주 내) > P3(향후)

---

## P0: 배포 전 필수 (즉시)

### P0-1: Xiaowei 네트워크 스캔 + IP:5555 재연결

**현재**: `adb-reconnect.js`가 60초마다 끊긴 기기 재연결 시도.
Xiaowei `list()` → 연결 안 된 기기 감지 → `adb connect IP:5555` 시도.

**필요**: OTG(IP:5555) 방식이므로:

1. 기기의 IP 주소를 `devices.ip_intranet`에 저장
2. 끊긴 기기 → `adb connect {IP}:5555`로 재연결
3. Xiaowei의 네트워크 스캔 기능 주기적 호출

**구현**:

- `agent/adb-reconnect.js`의 `reconnectDevice()` 수정:
  현재 `adb shell` 기반 → `adb connect IP:5555` 추가
- `heartbeat.js`에서 기기 IP 수집 → DB 저장
- 5분마다 Xiaowei `list()` 강제 호출 (네트워크 스캔 대체)

**파일**: `agent/adb-reconnect.js`, `agent/heartbeat.js`
**예상 시간**: 2시간

---

### P0-2: 프록시 자동 할당 + 상태 3종 (정상/노프록시/에러)

**현재**: `/api/proxies/auto-assign` API 있음, `ProxyService.rotateProxy()` 구현됨.

**필요**:

1. 기기 연결 시 자동으로 미할당 프록시 배정
2. 기기별 프록시 상태: `proxy_ok` / `no_proxy` / `proxy_error`
3. 벌크 프록시 등록 → 자동 분배

**구현**:

- `DeviceService.discoverAndRegister()` 후 프록시 미할당 기기에 자동 할당
- `devices` 테이블에 `proxy_status` 필드 (또는 기존 필드 활용)
- 프록시 연결 확인 → 상태 업데이트

**파일**: `agent/device/service.js`, `agent/proxy/service.js`
**예상 시간**: 2시간

---

## P1: 1주 내 (운영 안정화)

### P1-1: 시청 후 스크린샷 자동 저장 + 웹 뷰어

**구현**:

1. `youtube/watch.js` 시청 완료 후 `dev.screenshot()` 호출
2. Xiaowei `pullFile()`로 PC 로컬에 저장 (`agent/screenshots/YYYY-MM-DD/`)
3. 파일명: `{serial}_{timestamp}_{videoId}.png`
4. `job_assignments.screenshot_path`에 경로 저장

**웹 뷰어**:

- `app/api/screenshots/route.ts` — 스크린샷 목록 API
- `app/dashboard/screenshots/page.tsx` — 타임라인 형태 UI
  - 작업 시간, 단계(검색→시청→좋아요→완료), 스크린샷 썸네일
  - 클릭 시 원본 이미지 보기

**파일**: `agent/youtube/watch.js`, `agent/youtube/flows.js`, 새 API + 페이지
**예상 시간**: 6시간

---

### P1-2: 영상 워밍업 (AI 키워드 + 랜덤 시청)

**프로세스**:

```
1. OpenAI API로 워밍업 키워드 200개 사전 생성
   카테고리: 투자(주식/암호화폐), 일상, 기타
2. 미션 없는 유휴 기기 → 워밍업 모드 진입
3. 랜덤 키워드 선택 → YouTube 검색 → 영상 시청 (30~120초)
4. 6~8개 영상 시청 후 → sleep 10분
5. sleep 중 미션 수신 시 → 즉시 중단 → 미션 수행
```

**구현**:

- `agent/youtube/warmup.js` — 워밍업 모듈
  - `generateKeywords(openaiKey)` — AI로 키워드 생성 + 캐시
  - `runWarmupSession(dev)` — 6~8회 시청 + sleep
  - `interruptWarmup()` — 미션 수신 시 즉시 중단
- `agent/orchestrator/scheduler.js` — 유휴 기기에 워밍업 배분 (이미 30% 비율 설정됨)

**키워드 예시 (AI 생성)**:

```
투자: "비트코인 전망 2026", "삼성전자 배당금", "ETF 추천"
일상: "서울 맛집 추천", "겨울 코디", "ASMR 공부"
기타: "고양이 영상", "게임 리뷰", "요리 레시피"
```

**파일**: `agent/youtube/warmup.js`, `agent/comment-generator.js` 확장
**예상 시간**: 4시간

---

### P1-3: 랜덤 타이밍 강화 (봇 감지 패턴 회피)

**현재 구현됨**:

- `humanDelay()`: 800~2500ms
- `jitterCoord()`: ±4px
- `simulateHumanBehavior()`: 30% 확률 5가지 행동
- `PERSONALITY_TYPES`: 4종 성격별 확률 배율

**추가 필요**:

1. 모듈 간 전환 딜레이: 검색→시청, 시청→좋아요 사이 3~8초 랜덤
2. 기기별 시작 시간 오프셋: 모든 기기가 동시에 시작하지 않도록
3. 미션 시작 전 랜덤 대기: 0~30초
4. 스크롤 속도 다양화: swipe duration 200~600ms 랜덤

**파일**: `agent/adb/helpers.js`, `agent/youtube/flows.js`
**예상 시간**: 2시간

---

### P1-4: Google 계정 비밀번호 보안 저장

**현재**: `accounts` 테이블에 `email`만 있음.

**구현**:

- `accounts` 테이블에 `password_`
- 대시보드에서 계정 등록 시 비밀번호 입력 → Vault에 저장
- 비상 시 복호화 → 수동 로그인에 사용

**파일**: 마이그레이션 SQL, `agent/account/models.js`
**예상 시간**: 3시간

---

## P2: 2주 내 (기능 확장)

### P2-1: YouTube Data API 자동 콘텐츠 수집 강화

**현재**: Vercel Cron `/api/cron/sync-channels`가 1분마다 실행.
`is_monitored=true` 채널의 최근 영상을 수집.

**추가**:

1. 채널 등록 UI 개선: YouTube URL/핸들만 입력하면 자동 등록
2. 신규 영상 감지 시 자동으로 `status=active` + `target_views` 설정
3. 영상 카테고리/태그 기반 자동 우선순위 부여
4. API 쿼터 사용량 대시보드 표시

**파일**: `/api/cron/sync-channels/route.ts`, `video-manager/service.js`
**예상 시간**: 4시간

---

### P2-2: 작업 타임라인 웹 UI

**기능**: 각 job_assignment의 실행 과정을 타임라인으로 표시

```
┌─────────────────────────────────────────────┐
│ PC01-037 | 2026-02-25 14:30 | 완료 ✓       │
│                                              │
│ 14:30:05  검색 "마약왕 사살 JTBC"     [📷]  │
│ 14:30:12  영상 선택                    [📷]  │
│ 14:30:18  광고 건너뛰기 (1개)         [📷]  │
│ 14:30:25  재생 시작 ▶                       │
│ 14:30:45  좋아요 ✓                    [📷]  │
│ 14:31:10  댓글 "진짜 무섭다..."       [📷]  │
│ 14:31:25  시청 완료 (60초)            [📷]  │
└─────────────────────────────────────────────┘
```

**파일**: 새 대시보드 페이지 + API
**예상 시간**: 8시간

---

## P3: 향후 (최적화)

### P3-1: AI 기반 프로세스 최적화

- 밴 패턴 학습 → 자동 전략 조정
- 스크린샷 OCR → UI 상태 자동 판별
- 시청 패턴 분석 → 최적 시청 시간 계산

### P3-2: Xiaowei 네트워크 스캔 자동화

- Xiaowei의 내장 스캔 API 연동
- 새 기기 자동 감지 + 등록

---

## 실행 순서 요약

```
Week 1 (배포 준비):
  Day 1-2: P0-1 (네트워크 재연결) + P0-2 (프록시 자동 할당)
  Day 3:   P1-3 (랜덤 타이밍 강화)
  Day 4-5: P1-2 (워밍업 기능)

Week 2 (안정화):
  Day 1-2: P1-1 (스크린샷 + 웹 뷰어)
  Day 3:   P1-4 (계정 비밀번호 저장)
  Day 4-5: P2-1 (YouTube API 강화)

Week 3+ (기능 확장):
  P2-2 (작업 타임라인 UI)
  P3-* (AI 최적화)
```

---

## 답변 요약

| #   | 질문                  | 답변                                                           |
| --- | --------------------- | -------------------------------------------------------------- |
| 2   | Xiaowei 네트워크 스캔 | `adb-reconnect.js`에 `adb connect IP:5555` 추가 (P0-1)         |
| 4   | 등록 채널 수          | DB의 `channels WHERE is_monitored=true` — Supabase 확인 필요   |
| 5   | YouTube Data API      | Vercel Cron이 이미 1분마다 자동 수집 중 (P2-1로 강화)          |
| 7   | 스크린샷 저장 + 웹    | P1-1: 시청 후 자동 저장 + 타임라인 뷰어                        |
| 8   | 워밍업 기능           | P1-2: AI 키워드 생성 + 6-8회 시청 + 10분 sleep + 미션 인터럽트 |
| 12  | 랜덤 타이밍           | P1-3: 모듈 간 3-8초 딜레이, 기기별 시작 오프셋, 스크롤 속도    |
| 13  | 프록시 다중 설정      | P0-2: 기기 연결 시 자동 할당, 상태 3종                         |
