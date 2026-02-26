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
