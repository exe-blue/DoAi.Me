# 원격 PC에서 클라이언트 실행 가이드

원격 PC(노드 PC)에서 DoAi.Me Agent를 실행해 디바이스를 등록하고, 대기열에서 시청 명령을 받아 **실제 검색·시청·액션**(agent/youtube)을 수행하는 방법을 정리한다.

**Docker 사용 시**: Agent는 컨테이너 안에서 실행하고, **Xiaowei는 호스트(Windows)에서 그대로 실행**한다. 컨테이너는 `host.docker.internal`로 호스트의 Xiaowei WebSocket(22222)에 접속하므로 **통신에 문제 없다.**

---

## 1. 요약

| 구성요소 | 설명 |
|----------|------|
| **원격 PC** | Windows PC. ADB로 연결된 Android 기기(폰)들이 연결됨. |
| **Xiaowei** | **호스트**에서 실행. WebSocket(기본 22222)으로 디바이스 제어 제공. |
| **Agent** | Node.js. **Docker 컨테이너** 또는 네이티브 실행. Supabase + Xiaowei 연결, task_devices claim → **agent/youtube**로 검색·시청·액션 실행. |

**데이터 흐름**

1. **PC에서 클라이언트 실행** → Xiaowei(호스트) 기동 + Agent(Docker 또는 네이티브) 기동
2. **ADB 디바이스 → DB 반영** → Agent가 heartbeat 시 `pcs` 갱신, `devices` upsert (serial, connection_id 등)
3. **대기열·디스패치** → Vercel Cron 또는 API로 `task_queue` → `tasks` + `task_devices` 생성
4. **시청 명령 실행** → Agent가 `claim_task_devices_for_pc`로 최대 10대 claim → **agent/youtube** `executeYouTubeMission`(검색 → 시청 → 좋아요/댓글/구독/저장) 실행
5. **완료 시 DB 반영** → `complete_task_device` 호출, 상위 `tasks.devices_done` 등 갱신

---

## 2. Docker로 실행 (권장)

Agent를 Docker 컨테이너로 띄우고, **호스트에서 동작 중인 Xiaowei**에 `host.docker.internal:22222`로 접속한다.

### 2.1 요구사항

- **Windows**: Docker Desktop (WSL2 백엔드 권장)
- **Xiaowei**: 같은 PC(호스트)에서 실행, WebSocket 포트 22222
- **ADB**: 호스트에 설치·연결된 디바이스는 Xiaowei가 제어 (Agent는 Xiaowei 경유로만 제어)

### 2.2 이미지 빌드

저장소 루트에서:

```powershell
cd C:\Users\<user>\DoAi.Me
docker build -f Dockerfile.agent -t doai-agent .
```

### 2.3 환경 변수

`agent/.env`를 만들어 두고, **Docker 실행 시** 다음을 반드시 덮어쓴다.

- **XIAOWEI_WS_URL**  
  - 컨테이너에서 호스트로 나가야 하므로 `ws://host.docker.internal:22222/`  
  - (네이티브는 `ws://127.0.0.1:22222/`)

나머지(PC_NUMBER, SUPABASE_*, LOG_LEVEL 등)는 `agent/.env`와 동일하게 설정하면 된다.

| 변수 | 필수 | Docker 실행 시 권장 값 |
|------|------|------------------------|
| `PC_NUMBER` | ✅ | `PC01` (PC별로 변경) |
| `SUPABASE_URL` | ✅ | 프로젝트 URL |
| `SUPABASE_ANON_KEY` | ✅ | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role key |
| `XIAOWEI_WS_URL` | ✅ | **`ws://host.docker.internal:22222/`** |

### 2.4 컨테이너 실행

**방법 A: env 파일 + XIAOWEI 덮어쓰기**

```powershell
docker run -d --name doai-agent ^
  --env-file agent/.env ^
  -e XIAOWEI_WS_URL=ws://host.docker.internal:22222/ ^
  -v C:\Users\<user>\DoAi.Me\agent\logs:/app/logs ^
  --restart unless-stopped ^
  doai-agent
```

**방법 B: 변수만 직접 전달**

```powershell
docker run -d --name doai-agent ^
  -e PC_NUMBER=PC01 ^
  -e SUPABASE_URL=https://xxx.supabase.co ^
  -e SUPABASE_ANON_KEY=eyJ... ^
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... ^
  -e XIAOWEI_WS_URL=ws://host.docker.internal:22222/ ^
  -v C:\Users\<user>\DoAi.Me\agent\logs:/app/logs ^
  --restart unless-stopped ^
  doai-agent
```

- `-v .../logs:/app/logs`: 로그를 호스트에 남기려면 마운트.
- `--restart unless-stopped`: 재부팅 후 자동 재시작.

### 2.5 로그·재시작

```powershell
docker logs -f doai-agent
docker restart doai-agent
docker stop doai-agent
```

### 2.6 Linux 원격 PC에서 Docker 실행 시

Linux에서는 `host.docker.internal`이 기본이 아닐 수 있다. 다음 중 하나로 호스트의 Xiaowei에 접속할 수 있게 하면 된다.

- **옵션 1**: 실행 시 호스트 추가  
  `--add-host=host.docker.internal:host-gateway`  
  그대로 `XIAOWEI_WS_URL=ws://host.docker.internal:22222/` 사용.

- **옵션 2**: 호스트 네트워크 사용  
  `--network host`  
  그다음 `XIAOWEI_WS_URL=ws://127.0.0.1:22222/` 로 설정.

예 (Linux):

```bash
docker run -d --name doai-agent \
  --add-host=host.docker.internal:host-gateway \
  --env-file agent/.env \
  -e XIAOWEI_WS_URL=ws://host.docker.internal:22222/ \
  -v /path/to/agent/logs:/app/logs \
  --restart unless-stopped \
  doai-agent
```

---

## 3. 네이티브 실행 (선택)

Docker 없이 같은 PC에서 Node로 직접 실행할 때.

### 3.1 요구사항

- Node.js 18+ (권장 22.x)
- ADB(platform-tools), PATH 등록
- Xiaowei: 동일 PC에서 실행, WebSocket 22222

### 3.2 저장소 및 의존성

원격 PC에서는 Dev Container 가드를 건너뛰기 위해 **한 번만** 환경 변수를 설정한 뒤 `npm ci`를 실행한다.

```powershell
git clone https://github.com/your-org/DoAi.Me.git
cd DoAi.Me

set DOAI_ALLOW_NATIVE_NPM=1
npm ci
cd agent && npm ci && cd ..
```

(PowerShell: `$env:DOAI_ALLOW_NATIVE_NPM="1"; npm ci`)

### 3.3 환경 변수 (agent/.env)

`agent/.env.example`을 복사해 `agent/.env` 생성 후, 해당 PC에 맞게 수정.

| 변수 | 필수 | 설명 | 예시 |
|------|------|------|------|
| `PC_NUMBER` | ✅ | PC 식별자 (pcs.pc_number) | `PC01` |
| `SUPABASE_URL` | ✅ | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role key | `eyJ...` |
| `XIAOWEI_WS_URL` | ✅ | Xiaowei WebSocket (네이티브) | `ws://127.0.0.1:22222/` |

자세한 목록: [docs/ENV.md](ENV.md), [docs/PC_SETUP_CHECKLIST.md](PC_SETUP_CHECKLIST.md).

### 3.4 Xiaowei 설정

- Xiaowei를 **해당 PC에서** 실행.
- WebSocket: `%APPDATA%\xiaowei_wecan88888\config.toml` → `[websocket]` → `port = 22222`, `switch = true`
- ADB로 연결된 디바이스가 Xiaowei에서 인식되는지 확인.

### 3.5 Agent 실행

```powershell
cd C:\Users\<user>\DoAi.Me
node agent\agent.js
```

정상 시 로그 예:

- `[Supabase] Found PC: <uuid> (PC01)` 또는 `[Supabase] Created PC ...`
- `[Agent] ✓ Xiaowei connected`
- `[Agent] ✓ Device orchestrator started`
- `[Agent] Ready and listening for tasks`

---

## 4. 실행 흐름 (task_devices + agent/youtube)

1. **대기열 인젝션**  
   - API: `POST /api/queue` (body: `task_config` with `videoId`, `channelId`, `keyword`/`video_url`)  
   - 또는 Cron: 1분마다 `GET /api/cron/sync-channels` → 새 영상 `task_queue` 등록

2. **디스패치**  
   - Cron: 1분마다 `GET /api/cron/dispatch-queue`  
   - → `tasks` 1건 + 해당 PC/디바이스별 `task_devices` 생성 (status `pending`)

3. **Agent (원격 PC, Docker 또는 네이티브)**  
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

## 5. 문제 발생 시

- **Xiaowei 연결 실패**
  - **Docker**: `XIAOWEI_WS_URL=ws://host.docker.internal:22222/` 인지 확인. 방화벽에서 22222 허용.
  - **네이티브**: Xiaowei가 같은 PC에서 떠 있는지, `ws://127.0.0.1:22222/` 인지 확인.
- **PC 미등록**  
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 확인. Supabase `pcs` 테이블에 `pc_number`로 행이 생성되는지 확인.
- **task_devices 미실행**  
  - `task_devices.config`에 `inputs.keyword` 또는 `inputs.video_url` 포함 여부 확인 (포함 시 agent/youtube 경로 사용).  
  - 디바이스가 해당 PC의 `devices`에 있고 `connection_id` 또는 `serial`이 있어야 함.
- **Docker에서 host.docker.internal 연결 안 됨 (Linux)**  
  - `docker run` 시 `--add-host=host.docker.internal:host-gateway` 추가 후 재시도.

상세 체크리스트·롤백: [docs/PC_SETUP_CHECKLIST.md](PC_SETUP_CHECKLIST.md).
