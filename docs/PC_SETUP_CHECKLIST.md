# PC 배포 체크리스트

> 각 PC(PC01~PC04)에 처음 배포할 때 순서대로 따라할 매뉴얼.
> PC00은 개발용 — 이미 세팅됨.

---

## 1. 사전 요구사항 확인

```powershell
# Node.js 버전 (22.x 통일)
node --version
# 22.22.0 이어야 함. 아니면 nvm install 22.22.0 && nvm use 22.22.0

# npm 버전
npm --version
# 10.9.x

# ADB 버전 (platform-tools)
adb --version
# 35.0.x (전 PC 동일)

# PowerShell 버전
$PSVersionTable.PSVersion
# 5.1 이상

# Xiaowei 실행 확인
Test-NetConnection -ComputerName 127.0.0.1 -Port 22222
# TcpTestSucceeded: True
```

---

## 2. 코드 배포

```powershell
# 1. 저장소 클론 (최초 1회)
cd C:\Users\user\
git clone https://github.com/exe-blue/DoAi.Me.git
cd DoAi.Me

# 2. 의존성 설치
npm ci                    # 루트 (package-lock.json 기준 정확히 설치)
cd agent && npm ci && cd ..   # agent 의존성

# 3. 버전 확인
git log --oneline -1
# 현재 배포 버전 태그 확인
git describe --tags --always
```

---

## 3. 환경 변수 설정

```powershell
# agent/.env 생성 (PC별 값 변경!)
cp agent/.env.example agent/.env

# 편집: 아래 값을 PC에 맞게 수정
notepad agent\.env
```

**PC별 다른 값:**
| 변수 | PC01 | PC02 | PC03 | PC04 |
|------|------|------|------|------|
| `PC_NUMBER` | PC01 | PC02 | PC03 | PC04 |
| `WORKER_NAME` | node-pc-01 | node-pc-02 | node-pc-03 | node-pc-04 |
| `LOG_LEVEL` | info | info | info | info |

**공통 값 (모든 PC 동일):**
| 변수 | 값 |
|------|-----|
| `SUPABASE_URL` | (프로덕션 URL) |
| `SUPABASE_ANON_KEY` | (프로덕션 키) |
| `SUPABASE_SERVICE_ROLE_KEY` | (프로덕션 서비스 키) |
| `XIAOWEI_WS_URL` | `ws://127.0.0.1:22222/` |
| `OPENAI_API_KEY` | (공유 키) |
| `OPENAI_MODEL` | `gpt-4o-mini` |

---

## 4. Xiaowei 설정

```
1. Xiaowei 실행
2. WebSocket 활성화 확인:
   %APPDATA%\xiaowei_wecan88888\config.toml
   [websocket]
   port = 22222
   switch = true
3. VIP 활성화 확인 (code=10001 에러 시 VIP 필요)
```

---

## 5. 디바이스 연결 확인

```powershell
# 연결된 디바이스 수 확인
adb devices | Select-String "device$" | Measure-Object
# Count가 100이어야 함

# 특정 디바이스 응답 테스트
adb -s (첫번째시리얼) shell echo "ok"
```

---

## 6. Agent 시작

```powershell
cd C:\Users\user\DoAi.Me
node agent\agent.js

# 확인 사항:
# [Agent] ✓ Supabase connected
# [Agent] ✓ Xiaowei connected
# [Agent] ✓ PC registered: PC01
# [Agent] Ready and listening for tasks
```

---

## 7. 검증 (배포 후 1시간 이내)

- [ ] 대시보드에서 PC 상태 online 확인
- [ ] 디바이스 100대 전부 인식 확인
- [ ] 하트비트 정상 (30초 간격)
- [ ] 테스트 미션 1개 실행 → 완료 확인
- [ ] 로그 파일 생성 확인 (`agent/logs/YYYY-MM-DD.log`)
- [ ] Supabase에 execution_logs 기록 확인

---

## 8. 문제 발생 시

```powershell
# 롤백 (이전 안정 버전으로)
scripts\rollback.ps1 v0.1.0

# 수동 롤백
git fetch origin
git checkout v0.1.0
cd agent && npm ci && cd ..
node agent\agent.js
```
