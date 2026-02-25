# 장애 대응 & 복구 매뉴얼

> 이 문서를 안 만들면 새벽 3시에 깨어난다.

---

## 1. 장애 시나리오별 대응

| 장애 | 영향 | 자동 복구 | 수동 대응 |
|------|------|----------|----------|
| PC Agent 크래시 | 해당 PC 100대 중단 | PM2 auto-restart | SplashTop 접속 확인 |
| USB 허브 전원 차단 | 기기 전체 오프라인 | Agent 재연결 시도 | 물리적 전원 확인 |
| 단일 기기 ADB 끊김 | 1대 중단 | heartbeat가 감지, skip | 케이블 재연결 |
| Supabase Realtime 끊김 | 미션 수신 불가 | 자동 재구독 + polling fallback | Supabase 상태 확인 |
| Supabase DB 다운 | 전체 중단 | — | status.supabase.com 확인 |
| 계정 대량 밴 | 미션 실행 불가 | 자동 쿨다운 | 계정 풀 보충 |
| YouTube 앱 업데이트 | XML 셀렉터 깨짐 | 셀렉터 검증 → 자동 중지 | selectors.js 긴급 업데이트 |
| Windows 업데이트 재부팅 | PC 중단 | 시작 프로그램 자동 시작 | SplashTop 확인 |
| 프록시 대량 만료 | 미션 실패 증가 | 자동 교체 시도 | 프록시 보충 |

---

## 2. PM2 프로세스 매니저

### 설치 (각 PC에서 1회)
```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
```

### Agent 등록
```powershell
cd C:\Users\user\DoAi.Me
pm2 start agent\agent.js --name agent-PC01 --max-restarts 10 --restart-delay 5000
pm2 save
```

### PM2 명령어
```powershell
pm2 status                    # 상태 확인
pm2 logs agent-PC01           # 실시간 로그
pm2 restart agent-PC01        # 재시작
pm2 stop agent-PC01           # 중지
pm2 monit                     # CPU/메모리 모니터링
```

### 크래시 시 동작
1. PM2가 감지 → 5초 후 자동 재시작
2. 최대 10회 연속 크래시 시 중지 (무한 루프 방지)
3. 재시작 시 StaleTaskCleaner가 running → failed 롤백

---

## 3. Windows 시작 프로그램

### 방법 A: PM2 startup (권장)
```powershell
pm2-startup install
pm2 save
# Windows 재부팅 시 PM2가 자동 시작 → agent 자동 시작
```

### 방법 B: 배치 파일 (PM2 없이)
```
파일: C:\Users\user\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\start-agent.bat
내용:
@echo off
cd C:\Users\user\DoAi.Me
node agent\agent.js
```

---

## 4. 미완료 미션 복구

Agent 재시작 시 자동 실행됨 (`stale-task-cleaner.js`):

```
1. status='running'인 tasks → status='failed' + error='Agent crash recovery'
2. status='running'인 job_assignments → status='failed'
3. 30분 이상 running인 tasks → status='timeout'
```

이미 구현됨: `agent/stale-task-cleaner.js`

---

## 5. Graceful Shutdown

Agent는 SIGINT/SIGTERM 수신 시 (`agent/agent.js` shutdown 함수):

```
1. Stale task cleaner 중지
2. Device watchdog 중지
3. Task polling 중지
4. Job assignment polling 중지
5. Heartbeat 중지
6. ADB reconnect 중지
7. Proxy check loop 중지
8. Queue dispatcher 중지
9. Schedule evaluator 중지
10. Video dispatcher 중지
11. Config Realtime 구독 해제
12. Dashboard broadcaster 정리
13. Supabase Realtime 구독 해제 + 로그 플러시
14. PC 상태 → offline
15. Xiaowei 연결 해제
```

---

## 6. YouTube 앱 업데이트 대응

### 6.1 예방

모든 Galaxy S9에서 자동 업데이트 비활성화:
```
adb shell pm disable-user com.android.vending  # Play Store 비활성화
# 또는
adb shell settings put global auto_update 0
```

### 6.2 버전 고정

현재 사용 중인 YouTube APK 버전 기록:
```powershell
adb shell dumpsys package com.google.android.youtube | findstr versionName
# 기록: YouTube vXX.XX.XX
```

### 6.3 셀렉터 검증 (Agent 시작 시)

`agent/youtube/selectors.js`의 핵심 셀렉터 5개를 기동 시 검증:
- `like_button`
- `subscribe_button`  
- `skip_ad_button`
- `player_view`
- `search_edit_text`

검증 실패 시: 알림 + 미션 자동 중지.

### 6.4 핫픽스 배포 (selectors.js 변경 시)

```
1. PC00에서 새 셀렉터 확인 (uiautomator dump)
2. selectors.js 업데이트
3. git commit + push
4. PC01에 배포 → 5분 테스트
5. PC02~04 순차 배포
```

소요 시간 목표: 감지 → 수정 → 전체 배포 = **30분 이내**

---

## 7. 긴급 연락 체계

| 상황 | 심각도 | 대응 |
|------|--------|------|
| 1개 PC 다운 | 🟡 | 원격 접속으로 확인 (30분 이내) |
| 2개+ PC 동시 다운 | 🔴 | 즉시 확인 |
| 전체 기기 오프라인 | 🔴 | 현장 방문 |
| 계정 밴 파동 (10개+) | 🔴 | 전체 미션 중지 → 원인 분석 |
| Supabase 다운 | 🔴 | status.supabase.com 모니터링 |

---

## 8. 복구 우선순위

```
1순위: Agent 프로세스 살리기 (PM2 restart)
2순위: 기기 연결 복구 (USB/ADB)
3순위: Supabase 연결 확인
4순위: 미완료 미션 재처리 (자동)
5순위: 원인 분석 + 재발 방지
```
