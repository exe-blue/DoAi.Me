# 클라이언트(Agent) 배포 — 알파 방식

> 퍼블릭에서는 .exe 인스톨러가 필요하지만, 알파에서는 과도한 엔지니어링이다.  
> 알파에서 중요한 것: **Agent 안정성, API 연동, 대시보드 실시간 모니터링.**

---

## 1. 배포 형태: Git + 수동 실행

```
 개발 (PC00)                    운영 (PC01~04)
 ┌─────────────┐                ┌─────────────┐
 │ 코드 수정    │   git push    │ SplashTop   │
 │ PC00 테스트  │ ──────────→   │ 접속        │
 │ 커밋        │               │ git pull    │
 └─────────────┘               │ npm ci      │
                               │ pm2 restart │
                               └─────────────┘
```

- **PC00**: 개발/검증용. 직접 `node agent/agent.js` 또는 PM2로 실행.
- **PC01~04**: 운영. SplashTop 등으로 원격 접속 후 `scripts/deploy.ps1` 또는 수동 업데이트.

---

## 2. PC 환경 세팅 (1회)

각 PC에 **최초 1회** 수동 세팅. 상세는 [PC_SETUP_CHECKLIST.md](./PC_SETUP_CHECKLIST.md) 참고.

| # | 항목 | 확인 |
|---|------|------|
| 1 | Node.js v20 LTS 또는 v22 설치 | `node --version` |
| 2 | Git 설치 + 레포 클론 | `git clone ...` → `DoAi.Me` |
| 3 | 의존성 설치 | 루트·agent 각각 `npm ci` |
| 4 | `.env` 배치 | `agent/.env` (PC_NUMBER, SUPABASE_URL, SUPABASE_ANON_KEY 등, [ENV.md](./ENV.md) 참고) |
| 5 | Samsung USB Driver 설치 | 기기 인식용 |
| 6 | ADB platform-tools 설치 + PATH 등록 | `adb devices` 로 기기 인식 확인 |
| 7 | PM2 글로벌 설치 | `npm install -g pm2 pm2-windows-startup` |
| 8 | PM2 Windows 시작 등록 | `pm2-startup install` 후 `pm2 save` (재부팅 후 자동 시작) |
| 9 | Windows 방화벽 | Outbound 443 허용 (Supabase/Vercel) |
| 10 | Windows 자동 업데이트 | 알파 기간 재부팅 방지용 비활성화 권장 |
| 11 | 절전 모드 비활성화 | USB 전원 차단 방지 |
| 12 | Xiaowei 실행 및 WebSocket 포트 22222 활성화 | `config.toml` [websocket] switch = true |

---

## 3. Agent 실행

PC 식별은 **환경 변수**로만 한다. `agent/.env`에 `PC_NUMBER=PC00` 등 설정. (CLI 인자 `--pc=` 미사용)

```powershell
# PC00 (개발/테스트) — 수동 실행
cd C:\Users\user\DoAi.Me
node agent\agent.js

# PC01~04 (운영) — PM2로 관리 (권장)
cd C:\Users\user\DoAi.Me
pm2 start agent/ecosystem.config.js
pm2 save
```

- 상태 확인: `pm2 status` / `pm2 logs agent`
- 헬스: `http://127.0.0.1:9100/health` (AGENT_HEALTH_PORT, 기본 9100)

---

## 4. 업데이트 절차 (알파)

**SplashTop 등으로 해당 PC 접속 후** 한 대씩만 업데이트. **전체 동시 업데이트 금지.**

### 방법 A: deploy.ps1 (권장)

```powershell
cd C:\Users\user\DoAi.Me
.\scripts\deploy.ps1
```

- `git pull` → `npm ci` (루트·agent) → `.env` 검증 → PM2 재시작 → Smoke test 실행 후 PASS/FAIL 출력.
- 특정 버전: `.\scripts\deploy.ps1 v0.2.0`

### 방법 B: 수동

```powershell
cd C:\Users\user\DoAi.Me
pm2 stop agent
git pull origin main
npm ci
cd agent && npm ci && cd ..
pm2 start agent
pm2 logs agent --lines 20   # 정상 확인
node scripts\smoke-test.js  # E2E 검증 (선택)
```

**배포 순서:** PC01에서 1시간 확인 → PC02 → PC03 → PC04.

---

## 5. 알파 vs 퍼블릭 (준비 항목)

| 항목 | 알파에서 할 일 | 퍼블릭에서 추가 |
|------|----------------|------------------|
| 실행 | `node agent/agent.js` 또는 PM2 | pkg 등 바이너리 패키징 |
| 프로세스 관리 | PM2 | node-windows 서비스 등록 |
| 업데이트 | git pull + pm2 restart (또는 deploy.ps1) | 자동 업데이트 (버전 체크 → 다운로드 → restart) |
| 인증 | .env에 고정 API Key | OAuth + 라이센스 키 |
| 배포 | SplashTop 접속 수동 | Git webhook auto-deploy 등 |
| 환경 검증 | 수동 체크리스트 | 설치 위저드가 자동 검증 |

---

## 6. 아키텍처 (알파 — 단순화)

```
┌──────────────────────────────────────┐
│            doai.me (Vercel)          │
│  ┌─────────────┐  ┌──────────────┐   │
│  │ 인트라넷     │  │ API Routes   │   │
│  │ 대시보드     │  │ 94개 구현    │   │
│  │ (내부 전용)  │  │ 완료         │   │
│  └──────┬──────┘  └──────┬───────┘   │
└─────────┼────────────────┼───────────┘
          │                │
          ▼                ▼
┌──────────────────────────────────────┐
│         Supabase (DB + Realtime)     │
└──────────────────┬───────────────────┘
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌────────┐
│ PC00   │   │ PC01   │   │PC02~04 │
│ 개발   │   │ 운영   │   │ 운영   │
│ node   │   │ PM2    │   │ PM2    │
│ 직접   │   │ 관리   │   │ 관리   │
└────────┘   └────────┘   └────────┘
```

알파에서 빠진 것: 인스톨러, 자동 업데이트, 라이센스, 멀티유저.
