# VI. 알파 테스트 단계

## Phase A: PC00 단독 (1~2주)

**목표**: Agent + API + 대시보드 E2E 관통

### 1일차

- [ ] agent.js가 정상 시작되는지
- [ ] 하트비트가 Supabase(pcs/devices)에 반영되는지
- [ ] 대시보드 `/`에서 PC00이 표시되는지

### 2~3일차

- [ ] 기기 1대로 executeYouTubeMission E2E
- [ ] 태스크 생성(대시보드) → Agent 수신 → 실행 → 완료 보고
- [ ] 대시보드에서 태스크 진행률 실시간 반영 확인

### 4~5일차

- [ ] 동시 5대 → 10대 → 20대 스트레스 테스트
- [ ] concurrency/batchSize 확정
- [ ] 1시간 연속 실행 안정성 확인

### 6~7일차

- [ ] 에러 케이스 테스트 (USB 뽑기, 앱 크래시, 프록시 다운)
- [ ] 에러 로그가 대시보드 `/errors`에 표시되는지
- [ ] 기기 오프라인 → 하트비트에 반영 → 대시보드 반영

---

## Phase B: PC01 배포 (1주)

**목표**: 원격 PC에서 동일 동작 확인

### 1일차

- [ ] SplashTop으로 PC01 세팅 (체크리스트 따라)
- [ ] git clone + npm install + .env
- [ ] pm2 start → 하트비트 확인 → 대시보드에 PC01 표시

### 2~3일차

- [ ] PC01에서 기기 20대 미션 실행
- [ ] 대시보드에서 PC00 + PC01 동시 모니터링
- [ ] SplashTop 접속 끊어도 Agent 정상 동작 확인

### 4~5일차

- [ ] 24시간 무인 운영 테스트
- [ ] PM2 auto-restart 동작 확인 (강제 kill 후 복구)
- [ ] 대시보드 알림 피드에 이벤트 쌓이는지 확인

---

## Phase C: 전체 확장 (1~2주)

**목표**: 5대 PC, 500대 기기 운영

- [ ] PC02 → PC03 → PC04 순차 배포
- [ ] 대시보드에서 5개 PC 동시 모니터링
- [ ] 대규모 태스크 (500대 동시) 실행 테스트
- [ ] Supabase Realtime 5개 Agent 동시 구독 안정성
- [ ] 하트비트 5대 × 30초 = 10 calls/분 → API 부하 문제 없는지
- [ ] 일별 태스크 볼륨 예측 → Supabase/Vercel 플랜 한도 확인

---

# VII. 대시보드 사이트맵 (알파 — 축소)

```
doai.me/
├── /login                  ← 이메일+비번 로그인만
│
├── / (대시보드)             ← 메인. 실시간 상태, 스탯, PC목록, 태스크, 알림
│
├── INFRASTRUCTURE
│   ├── /pc                 ← PC(워커) 카드 그리드
│   ├── /devices            ← 기기 테이블 (필터, 상세 Sheet)
│   ├── /proxies            ← 프록시 테이블 (벌크추가, 자동할당)
│   └── /network            ← 네트워크 상태 시각화
│
├── CONTENT
│   ├── /channels           ← 채널 목록 + 영상
│   ├── /content            ← 영상 등록 + 목표 설정
│   └── /queue              ← 태스크 큐 (생성, 진행, 재시도)
│
├── AUTOMATION
│   ├── /presets            ← 명령 프리셋 (미션 템플릿)
│   └── /adb-presets        ← ADB 명령 프리셋 + 실행
│
└── SYSTEM
    ├── /settings           ← 시스템 설정 + 스케줄
    ├── /logs               ← 실시간 로그 뷰어
    └── /errors             ← 에러 분석 (차트 + 테이블)
```

**퍼블릭 때 추가될 것**

- `/download` — Agent 다운로드 (.exe)
- `/docs` — 문서 사이트
- `/pricing` — 요금제
- `/console/licenses` — 라이센스 관리
- `/console/api-keys` — API 키 관리 (고객용)

---

# VIII. 알파에서 검증할 핵심 지표

매일 확인해야 하는 숫자들. 대시보드에서 즉시 볼 수 있어야 함.

| 지표 | 목표 | 위험 수준 | 확인 위치 |
|------|------|-----------|-----------|
| 기기 온라인률 | > 95% | < 80% | 대시보드 스탯 카드 |
| 미션 성공률 | > 85% | < 70% | 대시보드 태스크 영역 |
| 하트비트 정상률 | > 99% | < 95% | /pc 페이지 |
| ADB 응답시간 | < 5초 | > 10초 | /logs (debug) |
| Realtime 연결 | 5/5 PC | < 5 | /network |
| 계정 밴률 | < 5%/일 | > 10% | 대시보드 RESOURCES |
| 프록시 생존률 | > 90% | < 70% | 대시보드 RESOURCES |

---

# IX. 알파 → 퍼블릭 전환 시 추가 작업

알파가 안정화되면, 퍼블릭 출시를 위해 다음을 추가.

## 클라이언트

- [ ] pkg로 Node.js → 단일 바이너리 (.exe)
- [ ] Inno Setup으로 Windows 인스톨러
- [ ] 설치 위저드 (환경 검증 자동화)
- [ ] 자동 업데이트 (버전 체크 → 다운로드 → graceful restart)
- [ ] 라이센스 키 검증 + 하드웨어 바인딩
- [ ] node-windows로 시스템 서비스 등록

## 사이트

- [ ] 랜딩 페이지 (제품 소개, 요금제)
- [ ] /download 페이지 (Agent 다운로드)
- [ ] /docs 문서 사이트 (설치/API/FAQ)
- [ ] Google OAuth 로그인
- [ ] 멀티 유저 + 역할 권한 (admin/operator/viewer)
- [ ] RLS 세분화 (유저별 데이터 격리)

## 인프라

- [ ] Supabase Pro 플랜 (Realtime 동시접속, DB 사이즈)
- [ ] Vercel Pro 플랜 (Serverless 실행시간)
- [ ] 에러 알림 (Slack/Discord webhook)
- [ ] 일별 자동 리포트
