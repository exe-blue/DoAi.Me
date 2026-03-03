# node agent.js 웹소켓 에러 분석

## 연결 흐름

1. **agent.js**  
   - `config.xiaoweiWsUrl` (기본값 `ws://127.0.0.1:22222/`) 로 `XiaoweiClient` 생성  
   - `waitForXiaowei(xiaowei, 10000)` 호출 → 최대 10초 동안 연결 대기

2. **xiaowei-client.js**  
   - `connect()` 에서 `new WebSocket(this.wsUrl)` 생성  
   - `open` → `emit("connected")`  
   - `error` → `console.error("[Xiaowei] WebSocket error: ...")` + `emit("error")`  
   - `close` → 자동 재연결 `_scheduleReconnect()` (1초 후, 실패 시 지수 백오프 최대 30초)

3. **에러 시 동작**  
   - 10초 안에 연결 실패 시: `[Agent] ✗ Xiaowei connection failed: Xiaowei did not connect within 10s`  
   - 에이전트는 종료하지 않고 계속 실행하며, Xiaowei는 백그라운드에서 재연결 시도

---

## 웹소켓 에러가 나는 주요 원인

### 1. Xiaowei가 실행 중이 아님 (가장 흔함)

- **대상 주소**: `ws://127.0.0.1:22222/`
- 이 주소는 **Xiaowei(소위에이) 자동화 도구**의 WebSocket 서버입니다.
- 해당 프로그램이 **같은 PC에서 실행 중이 아니면** 연결이 거절됩니다.

**확인:**

```bash
# Windows: 22222 포트 리스닝 여부
netstat -an | findstr 22222

# WSL/Linux
ss -tlnp | grep 22222
# 또는
curl -v --no-buffer -N -H "Connection: Upgrade" -H "Upgrade: websocket" "http://127.0.0.1:22222/"
```

- 아무것도 안 나오면 → **Xiaowei를 먼저 실행**한 뒤 다시 `node agent.js` 실행.

---

### 2. WSL에서 실행 시 127.0.0.1 의미 차이

- 에이전트를 **WSL**에서 돌리고, Xiaowei는 **Windows**에서 돌리는 경우:
  - WSL 안에서의 `127.0.0.1` = **WSL 자신**
  - Windows에서 떠 있는 Xiaowei(22222)는 **Windows의 127.0.0.1**에 있음.
  - 따라서 WSL → `127.0.0.1:22222` 로 접속하면 **연결 실패**할 수 있음.

**해결:**

- **방법 A**: 에이전트를 **Windows**에서 실행 (PowerShell/CMD에서 `node agent\agent.js`).
- **방법 B**: WSL에서 Windows 호스트로 접속하도록 URL 변경  
  - Windows 11 / 최신 WSL2: `ws://localhost:22222/` (때로는 Windows 쪽으로 라우팅됨)  
  - 또는 `agent/.env` 에서:
    ```env
    XIAOWEI_WS_URL=ws://$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):22222/
    ```
    대신, Windows 호스트 IP를 직접 넣는 편이 안정적입니다.  
    - 예: Windows IP가 `192.168.0.10` 이면  
      `XIAOWEI_WS_URL=ws://192.168.0.10:22222/`

---

### 3. 방화벽 / 포트 차단

- Windows 방화벽이나 회사/가정 방화벽이 **로컬 22222** 를 막으면 연결 실패할 수 있음.
- **확인**: Xiaowei를 켠 상태에서 동일 PC의 브라우저 콘솔이나 다른 클라이언트로 `ws://127.0.0.1:22222/` 접속 테스트.

---

### 4. 포트/URL 오타

- `agent/.env` 의 `XIAOWEI_WS_URL` 이 실제 Xiaowei가 리스닝하는 주소/포트와 같은지 확인.
- 기본값은 `ws://127.0.0.1:22222/` (끝의 `/` 포함).

---

## 요약 체크리스트

| 항목 | 확인 |
|------|------|
| Xiaowei(소위에이) 프로그램이 **같은 PC**에서 실행 중인가? | |
| 22222 포트가 리스닝 중인가? (`netstat` / `ss`) | |
| 에이전트를 WSL에서 돌리는 경우, Xiaowei는 Windows인가? → Windows 호스트 IP로 `XIAOWEI_WS_URL` 설정 | |
| 방화벽에서 22222 포트 허용 여부 | |

에러 메시지가 `ECONNREFUSED` 이면 **해당 주소에 서버(Xiaowei)가 없음** → 위 1·2번을 우선 확인하면 됩니다.

---

## 연결 로그 및 실패 시 출력 (디버깅)

### effectiveUrl 결정 (단일 소스)

- **위치**: `config.js` 의 `getEffectiveWsUrl()` 만 사용.
- **규칙**: `process.env.XIAOWEI_WS_URL` 이 있으면 그 값, 없으면 `ws://127.0.0.1:22222/`.
- 앱/에이전트 내 다른 하드코딩·다른 env 경로 사용 금지.

### 연결 직전 로그 (로그 파일 + UI)

매 연결 시도 직전에 다음이 출력된다.

- **로그 파일** (agent-stdout.log / stderr):
  - `[Xiaowei] connect_attempt effectiveUrl="ws://127.0.0.1:22222/" attemptNo=1`
- **UI** (StatusBoard / Settings): 상태 파일(`agent-ws-status.json`)을 통해 **effectiveUrl**, **attempt #N**, **WS Status**(CONNECTING/CONNECTED/FAILED), **Last failure** 표시.

예시 (로그):

```
[Xiaowei] connect_attempt effectiveUrl="ws://127.0.0.1:22222/" attemptNo=1
[WS] failed closeCode=1006 closeReason="" effectiveUrl="ws://127.0.0.1:22222/"
```

### 연결 실패 시 반드시 출력되는 정보

모든 실패 로그/상태에 다음이 포함된다: **effectiveUrl**, **error.message**(또는 close 시 "close"), **closeCode/closeReason**(close 이벤트인 경우), **attemptNo**, **failureKind**.

- **동기 오류** (connect 직후 catch):
  - `[Xiaowei] connect_failed effectiveUrl="..." error.message=... attemptNo=N failureKind=URL`
- **error 이벤트**:
  - `[WS] failed effectiveUrl="..." error.message=... attemptNo=N failureKind=URL|HANDSHAKE|CLIENT`
- **close 이벤트**:
  - `[WS] failed effectiveUrl="..." error.message=close closeCode=... closeReason=... attemptNo=N failureKind=HANDSHAKE|CLIENT`
- **UI**: 상태 파일 `lastFailure` 에 동일 요약이 들어가 "Last failure"에 표시된다 (effectiveUrl, error.message, closeCode/closeReason, attemptNo, [failureKind] 포함).

### close code / message 예시

| 상황 | closeCode | closeReason 예시 |
|------|-----------|------------------|
| 정상 종료 | 1000 | (비어 있거나 "Normal closure") |
| 비정상 끊김(네트워크 등) | 1006 | "" (빈 문자열인 경우 많음) |
| 서버가 HTTP 업그레이드 거절(경로/스킴 오류) | 1002 등 | 프로토콜 오류 메시지 |

- **1006**: 보통 **핸드셰이크 미완료** 또는 연결 중 끊김. 서버가 리스닝 중인데도 1006이면 **경로(/, /ws 등) 또는 스킴(ws/wss)** 이 서버와 다를 수 있음.
- **HTTP 400/404** 가 보이면: 서버가 요구하는 **경로**와 **스킴**을 서버 문서/로그로 확인한 뒤, `XIAOWEI_WS_URL` 을 해당 경로·스킴에 맞게 수정.

### 실패 원인 분류 (failureKind)

로그와 UI의 `lastFailure` 에 `[URL]`, `[HANDSHAKE]`, `[CLIENT]` 중 하나가 붙어 있어, 원인을 구분할 수 있다.

| failureKind | 의미 | 조치 |
|-------------|------|------|
| **URL** | 잘못된 호스트/포트 또는 서버 미기동. `error.message`에 ECONNREFUSED/ENOTFOUND/ECONNRESET 등. | effectiveUrl·포트·방화벽·WSL vs Windows 확인. |
| **HANDSHAKE** | TCP는 되지만 WebSocket 업그레이드 거절. closeCode 1006/1002 등. | **경로(/, /ws 등)·스킴(ws/wss)** 이 서버와 일치하는지 확인. `XIAOWEI_WS_URL` 수정. |
| **CLIENT** | 그 외 (이벤트 순서·기타 클라이언트 처리). | 로그 순서·스택 확인. |

### 원인 결론 정리 (진단 시 참고)

- **effectiveUrl이 실제로 찍히는 예시**
  - 로그: `[Xiaowei] connect_attempt effectiveUrl="ws://127.0.0.1:22222/" attemptNo=1`
  - 실패 시: `[WS] failed effectiveUrl="ws://127.0.0.1:22222/" error.message=close closeCode=1006 closeReason="" attemptNo=1 failureKind=HANDSHAKE`
  - UI "Last failure": `effectiveUrl="ws://127.0.0.1:22222/" closeCode=1006 closeReason="" attemptNo=1 [HANDSHAKE]`

- **effectiveUrl 로그가 `ws://127.0.0.1:22222/` 가 아님** → **URL/경로/스킴 결정 문제**. `getEffectiveWsUrl()` 단일 소스와 spawn 시 `XIAOWEI_WS_URL` 전달만 사용하는지 확인.
- **effectiveUrl은 맞는데 failureKind=URL (ECONNREFUSED 등)** → **주소/포트/방화벽** (서버 미기동, WSL vs Windows, 방화벽).
- **effectiveUrl 맞고 Test-NetConnection 성공인데 failureKind=HANDSHAKE (close 1006 등)** → **핸드셰이크 거절(경로·스킴 불일치)**. 서버가 요구하는 경로(예: `/`, `/ws`)와 스킴(ws/wss)에 맞게 `XIAOWEI_WS_URL` 수정.
- **failureKind=CLIENT** → **클라이언트 이벤트 처리** 쪽 의심. 로그 순서·재현 절차 확인.
