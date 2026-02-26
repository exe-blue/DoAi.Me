# 원격 PC에서 클라이언트 실행 가이드

원격 PC(노드 PC)에서 DoAi.Me Agent를 실행해 디바이스를 등록하고, 대기열에서 시청 명령을 받아 **실제 검색·시청·액션**(agent/youtube)을 수행하는 방법을 정리한다.

---

## 1. 요약

| 구성요소 | 설명 |
|----------|------|
| **원격 PC** | Windows PC. ADB로 연결된 Android 기기(폰)들이 연결됨. |
| **Xiaowei** | 같은 PC에서 실행. WebSocket(기본 22222)으로 Agent에 디바이스 제어 제공. |
| **Agent** | Node.js (`agent/agent.js`). Supabase + Xiaowei 연결, task_devices claim → **agent/youtube**로 검색·시청·액션 실행. |

**데이터 흐름**

1. **PC에서 클라이언트 실행** → Agent + Xiaowei 기동
2. **ADB 디바이스 → DB 반영** → Agent가 heartbeat 시 `pcs` 갱신, `devices` upsert (serial, connection_id 등)
3. **대기열·디스패치** → Vercel Cron 또는 API로 `task_queue` → `tasks` + `task_devices` 생성
4. **시청 명령 실행** → Agent가 `claim_task_devices_for_pc`로 최대 10대 claim → `config.inputs.keyword`/`video_url` 있으면 **agent/youtube** `executeYouTubeMission`(검색 → 시청 → 좋아요/댓글/구독/저장) 실행
5. **완료 시 DB 반영** → `complete_task_device` 호출, 상위 `tasks.devices_done` 등 갱신

---

## 2. 원격 PC 준비 (Windows)

### 2.1 필수 설치

- **Node.js** 18+ (권장 22.x)
- **ADB** (platform-tools), PATH 등록
- **Xiaowei** (동일 PC에서 실행, WebSocket 포트 22222)

### 2.2 저장소 및 의존성

```powershell
# 클론
git clone https://github.com/your-org/DoAi.Me.git
cd DoAi.Me

# 루트 + agent 의존성
npm ci
cd agent && npm ci && cd ..
```

### 2.3 환경 변수 (agent/.env)

`agent/.env.example`을 복사해 `agent/.env` 생성 후, **해당 PC에 맞게** 수정.

| 변수 | 필수 | 설명 | 예시 |
|------|------|------|------|
| `PC_NUMBER` | ✅ | PC 식별자 (pcs.pc_number) | `PC01` |
| `SUPABASE_URL` | ✅ | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role key (Agent 전용) | `eyJ...` |
| `XIAOWEI_WS_URL` | ✅ | Xiaowei WebSocket 주소 | `ws://127.0.0.1:22222/` |

선택: `WORKER_NAME`(레거시), `HEARTBEAT_INTERVAL`, `LOG_LEVEL` 등. 자세한 목록은 [docs/ENV.md](ENV.md), [docs/PC_SETUP_CHECKLIST.md](PC_SETUP_CHECKLIST.md) 참고.

---

## 3. Xiaowei 설정

- Xiaowei를 **해당 PC에서** 실행.
- WebSocket 설정 확인: `%APPDATA%\xiaowei_wecan88888\config.toml`  
  - `[websocket]` → `port = 22222`, `switch = true`
- ADB로 연결된 디바이스가 Xiaowei에서 인식되는지 확인.

---

## 4. Agent 실행

```powershell
cd C:\Users\<user>\DoAi.Me
node agent\agent.js
```

정상 시 로그 예:

- `[Supabase] Found PC: <uuid> (PC01)` 또는 `[Supabase] Created PC ...`
- `[Agent] ✓ Xiaowei connected`
- `[TaskDevicesRunner] Started (slots=10, leaseMin=5)`
- `[Agent] Ready and listening for tasks`

같은 PC에서 **Xiaowei가 먼저** 떠 있어야 하며, Agent는 **Xiaowei와 같은 PC**에서만 실행한다 (로컬 WebSocket 사용).

---

## 5. 실행 흐름 (task_devices + agent/youtube)

1. **대기열 인젝션**  
   - API: `POST /api/queue` (body: `task_config` with `videoId`, `channelId`, `keyword`/`video_url`)  
   - 또는 Cron: 1분마다 `GET /api/cron/sync-channels` → 새 영상 `task_queue` 등록

2. **디스패치**  
   - Cron: 1분마다 `GET /api/cron/dispatch-queue`  
   - → `tasks` 1건 + 해당 PC/디바이스별 `task_devices` 생성 (status `pending`)

3. **Agent (원격 PC)**  
   - 5초마다 `claim_task_devices_for_pc(pcId, 10)` 호출  
   - claim된 각 task_device에 대해:  
     - `config.inputs.keyword` 또는 `config.inputs.video_url`/`videoId`가 있으면  
       **agent/youtube** `executeYouTubeMission(dev, mission)` 실행  
         - 검색: `searchAndSelect(dev, keyword)`  
         - 광고: `handlePrerollAds`, `ensurePlaying`  
         - 시청: `watchVideo(dev, watchDuration)`  
         - 액션: `likeVideo`, `writeComment`, `subscribeChannel`, `saveToPlaylist` (payload 확률에 따라)  
     - 없으면 DB 스크립트(scriptRef) 기반 step 실행

4. **완료**  
   - `complete_task_device(taskDeviceId, pcId, result)` → DB 반영, 트리거로 `tasks.devices_done` 등 갱신

---

## 6. 문제 발생 시

- **Xiaowei 연결 실패**  
  - 같은 PC에서 Xiaowei 실행 여부, 방화벽/포트 22222, `XIAOWEI_WS_URL` 확인.
- **PC 미등록**  
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 확인. Supabase `pcs` 테이블에 `pc_number`로 행이 생성되는지 확인.
- **task_devices 미실행**  
  - `task_devices.config`에 `inputs.keyword` 또는 `inputs.video_url` 포함 여부 확인 (포함 시 agent/youtube 경로 사용).  
  - 디바이스가 해당 PC의 `devices`에 있고 `connection_id` 또는 `serial`이 있어야 함.

상세 체크리스트·롤백은 [docs/PC_SETUP_CHECKLIST.md](PC_SETUP_CHECKLIST.md) 참고.
