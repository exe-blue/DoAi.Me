# DoAi.Me 운영 매뉴얼 (Runbook)

> "나 혼자만 운영할 수 있으면 프로덕트가 아니다."
> 이 문서만 읽으면 누구든 시스템을 운영할 수 있어야 한다.

---

## 목차

1. [시스템 개요](#1-시스템-개요)
2. [새 PC 세팅](#2-새-pc-세팅)
3. [일상 운영](#3-일상-운영)
4. [장애 대응](#4-장애-대응)
5. [계정 & 프록시 보충](#5-계정--프록시-보충)
6. [YouTube 앱 변경 대응](#6-youtube-앱-변경-대응)
7. [배포 & 업데이트](#7-배포--업데이트)
8. [긴급 명령어 모음](#8-긴급-명령어-모음)

---

## 1. 시스템 개요

```
[Vercel] Next.js 대시보드 + API
    ↕
[Supabase] DB + Realtime
    ↕
[PC00~04] Node.js Agent × 5
    ↕ Xiaowei WebSocket
[Galaxy S9] × 500대 (PC당 100대)
```

| 구성 요소 | 역할 | 접속 방법 |
|----------|------|----------|
| 대시보드 | 모니터링 + 미션 관리 | 브라우저 (Vercel URL) |
| Supabase | DB + 실시간 | dashboard.supabase.com |
| PC00 | 개발/테스트 | 직접 접근 |
| PC01~04 | 운영 | SplashTop 원격 |
| Xiaowei | 디바이스 제어 | 각 PC 로컬 (port 22222) |

---

## 2. 새 PC 세팅

> 상세: `docs/PC_SETUP_CHECKLIST.md`

### 요약 (10분 소요)

```powershell
# 1. Node.js 22.x 설치 확인
node --version    # v22.22.0

# 2. 코드 다운로드
git clone https://github.com/exe-blue/DoAi.Me.git
cd DoAi.Me

# 3. 의존성 설치
npm ci
cd agent && npm ci && cd ..

# 4. 환경변수 설정
cp agent\.env.example agent\.env
notepad agent\.env
# PC_NUMBER=PC0X 변경, Supabase 키 입력

# 5. Xiaowei 실행 확인
# → config.toml에 websocket port=22222, switch=true

# 6. PM2 설치 + Agent 시작
npm install -g pm2 pm2-windows-startup
pm2 start agent\ecosystem.config.js
pm2-startup install
pm2 save

# 7. 검증
pm2 status        # online 확인
pm2 logs agent    # 에러 없는지 확인
```

### 디바이스 연결

```powershell
# USB 허브 연결 후
adb devices | Select-String "device$" | Measure-Object
# Count = 100 이어야 함

# 부족하면
adb kill-server
adb start-server
adb devices
```

---

## 3. 일상 운영

### 아침 체크 (출근 시, 5분)

```
□ 대시보드 접속 → 5개 PC 전부 online?
□ GET /api/dashboard/realtime → offline 기기 수 확인 (< 10이면 정상)
□ GET /api/dashboard/errors?hours=12 → 밤사이 에러 확인
□ 계정 밴 확인: GET /api/dashboard/accounts → banned 수
```

```powershell
# 명령줄로 빠르게 확인 (PowerShell)
# PC 상태
Invoke-RestMethod "https://YOUR-DOMAIN/api/dashboard/realtime" | ConvertTo-Json

# 에러 요약
Invoke-RestMethod "https://YOUR-DOMAIN/api/dashboard/errors?hours=12" | ConvertTo-Json
```

### 저녁 체크 (퇴근 전, 3분)

```
□ GET /api/dashboard/missions → 오늘 달성률 확인
□ 내일 영상 등록: 대시보드 → 채널 → 영상 추가
□ 로그 파일 크기 이상 없는지 (SplashTop으로 확인)
```

### 주간 체크 (매주 월요일, 15분)

```
□ 계정 풀 잔여: available > 500 이면 OK, 아니면 보충
□ 프록시 만료일 확인: 제공업체 대시보드
□ YouTube 앱 버전 확인:
  adb -s 시리얼 shell dumpsys package com.google.android.youtube | findstr versionName
  → 전 기기 동일 버전인지
□ Supabase 사용량: dashboard.supabase.com → Usage
  DB 크기 < 4GB OK (Pro 한도 8GB)
□ 수동 데이터 정리 (필요 시):
  Supabase SQL Editor에서 COST_ANALYSIS.md의 정리 쿼리 실행
```

---

## 4. 장애 대응

> 상세: `docs/INCIDENT_RESPONSE.md`

### 4.1 Agent 다운

**증상**: 대시보드에서 PC 상태 offline, 하트비트 3분+ 없음

```powershell
# SplashTop으로 해당 PC 접속
pm2 status

# online이 아니면
pm2 restart agent

# PM2 자체가 안 뜨면
cd C:\Users\user\DoAi.Me
node agent\agent.js    # 수동 실행, 에러 메시지 확인
```

### 4.2 기기 대량 오프라인 (10대+)

**증상**: 대시보드에서 특정 PC의 online 수 급감

```powershell
# 1. USB 허브 전원 확인 (물리적)
# 2. ADB 서버 재시작
adb kill-server
adb start-server
adb devices | Select-String "device$" | Measure-Object

# 3. 여전히 부족하면 USB 케이블 하나씩 재연결
```

### 4.3 미션 실패율 급증 (>20%)

```powershell
# 1. 에러 유형 확인
Invoke-RestMethod "https://YOUR-DOMAIN/api/dashboard/errors?hours=1"

# 2. 유형별 대응
#   timeout → Xiaowei 확인
#   account → 계정 밴 파동 → 전체 미션 중지
#   youtube → 앱 업데이트 → 섹션 6 참고
#   proxy → 프록시 만료/차단 → 프록시 교체
```

### 4.4 계정 밴 파동 (5개+)

```powershell
# 즉시: 전체 미션 중지
# Supabase SQL:
# UPDATE tasks SET status='cancelled' WHERE status='pending';

# 원인 분석:
# 1. 같은 채널에 집중되었는지 → 채널별 제한 검토
# 2. 같은 IP 대역이었는지 → 프록시 분산 검토
# 3. 특정 액션(댓글)에서 발생했는지 → 댓글 확률 낮추기

# 복구: 새 계정 보충 후 미션 재개
```

### 4.5 Supabase 연결 끊김

```powershell
# Agent 로그 확인
pm2 logs agent --lines 50 | findstr "Supabase\|realtime\|ECONNREFUSED"

# Supabase 상태 확인
# https://status.supabase.com

# Polling fallback이 자동 작동하는지 확인
# → "[Supabase] Claimed unassigned task:" 로그가 보이면 OK
```

---

## 5. 계정 & 프록시 보충

### 5.1 계정 보충 절차

```
1. 계정 풀 확인
   GET /api/dashboard/accounts → available 수 확인

2. 새 계정 준비
   - Gmail 계정 생성 (또는 구매)
   - 각 계정에 YouTube 최초 로그인 완료

3. DB 등록
   대시보드 → 계정 관리 → 계정 추가
   또는 Supabase SQL:
   INSERT INTO accounts (email, status) VALUES ('new@gmail.com', 'available');

4. 디바이스에 로그인
   - Xiaowei로 디바이스에 Google 계정 로그인 수동 진행
   - 또는 계정 매니저가 자동 할당 대기

5. 워밍업 기간
   - 처음 3~7일은 시청만 (좋아요/댓글 금지)
   - status='available'로 두되 prob_comment=0, prob_like=0 설정
```

### 5.2 프록시 보충 절차

```
1. 프록시 풀 확인
   GET /api/dashboard/proxies → active 수, invalid 수

2. 새 프록시 구매
   - Residential 프록시 권장 (데이터센터 X)
   - 한국 IP, 최소 3개 ISP 분산

3. DB 등록
   대시보드 → 프록시 관리 → 벌크 추가
   또는 API:
   POST /api/proxies/bulk
   Body: { text: "socks5://user:pass@host:port\nhttp://host2:port2" }

4. 자동 할당
   POST /api/proxies/auto-assign
   → 미할당 디바이스에 자동 매핑
```

---

## 6. YouTube 앱 변경 대응

> "만약"이 아니라 "언제" 일어나느냐의 문제다.

### 6.1 감지

Agent 시작 시 preflight check가 자동 실행 (구현됨):
```
[youtube.preflight] preflight_failed — missing: ['like_button']
```

또는 미션 실패율 급증 + 에러 유형이 `youtube`일 때.

### 6.2 대응 절차 (목표: 30분 이내)

```
=== 1. 진단 (PC00에서, 5분) ===

# 현재 YouTube 버전 확인
adb -s 시리얼 shell dumpsys package com.google.android.youtube | findstr versionName

# UI dump 저장
adb -s 시리얼 shell uiautomator dump /sdcard/ui.xml
adb -s 시리얼 pull /sdcard/ui.xml C:\scripts\ui_new.xml

# 변경된 resource-id 찾기 (이전 dump와 비교)
# 검색: like_button, subscribe_button, skip_ad_button, title, channel_name

=== 2. selectors.js 수정 (PC00에서, 10분) ===

# agent/youtube/selectors.js 열기
# RES 객체의 변경된 resource-id 업데이트
# COORDS 좌표 비율 변경 여부 확인

=== 3. 검증 (PC00에서, 5분) ===

# preflight check 실행
node -e "
  const { ADBDevice } = require('./agent/adb');
  const { preflightCheck } = require('./agent/youtube');
  // ... 검증 코드
"

=== 4. 배포 (10분) ===

git add agent/youtube/selectors.js
git commit -m 'hotfix: update YouTube selectors for vXX.XX'
git tag -a vX.Y.Z -m 'YouTube selector hotfix'
git push origin main --tags

# PC01 먼저
# SplashTop 접속 → npm run deploy → pm2 restart agent
# 5분 정상 확인

# PC02~04 순차
```

### 6.3 예방

```powershell
# 모든 기기 YouTube 자동 업데이트 비활성화
adb -s 시리얼 shell pm disable-user com.android.vending

# 버전 고정: 현재 작동하는 APK 백업
adb -s 시리얼 shell pm path com.google.android.youtube
# → /data/app/com.google.android.youtube-xxx/base.apk
adb -s 시리얼 pull /data/app/.../base.apk C:\backup\youtube_vXX.apk
```

---

## 7. 배포 & 업데이트

### 일반 업데이트

```powershell
# PC00에서 먼저 테스트
git pull origin main
npm ci && cd agent && npm ci && cd ..
pm2 restart agent
# 30분 안정 확인

# PC01에 배포
# SplashTop → npm run deploy
# 1시간 안정 확인

# PC02~04 순차 (전체 동시 배포 절대 금지)
```

### 긴급 롤백

```powershell
npm run rollback -- v0.2.0
pm2 restart agent
```

### 버전 태깅

```powershell
# 안정 버전 태그
git tag -a v0.3.0 -m "설명"
git push origin --tags

# 태그 목록
git tag -l
```

---

## 8. 긴급 명령어 모음

### PC Agent

```powershell
pm2 status                         # 상태
pm2 restart agent                  # 재시작
pm2 logs agent --lines 100        # 최근 로그
pm2 monit                         # CPU/메모리 실시간
```

### ADB

```powershell
adb devices                        # 연결 기기 목록
adb kill-server && adb start-server # ADB 재시작
adb -s SERIAL shell echo ok       # 특정 기기 응답 확인
adb -s SERIAL shell wm size       # 해상도 확인
```

### Git

```powershell
git pull origin main               # 최신 코드
git log --oneline -5               # 최근 커밋
git checkout v0.2.0                # 특정 버전으로 롤백
git describe --tags --always       # 현재 버전
```

### Supabase 긴급 SQL

```sql
-- 전체 미션 중지
UPDATE tasks SET status='cancelled' WHERE status='pending';

-- running 미션 강제 실패 (Agent 크래시 후)
UPDATE tasks SET status='failed', error='manual reset'
WHERE status='running';

-- 계정 쿨다운 전체 해제
UPDATE accounts SET status='available', cooldown_until=NULL
WHERE status='cooldown';

-- 오늘 통계
SELECT
  COUNT(*) FILTER (WHERE status='completed') AS completed,
  COUNT(*) FILTER (WHERE status='failed') AS failed,
  COUNT(*) AS total
FROM job_assignments
WHERE completed_at >= CURRENT_DATE;
```

### API 빠른 확인

```powershell
# 시스템 헬스
curl https://YOUR-DOMAIN/api/health

# 실시간 상태
curl https://YOUR-DOMAIN/api/dashboard/realtime

# 에러 요약
curl "https://YOUR-DOMAIN/api/dashboard/errors?hours=1"
```
