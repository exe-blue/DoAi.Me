# WebSocket 원격 PC 재현 테스트 절차

원격 PC(Admin)에서 desktop 앱의 Xiaowei WebSocket 연결 실패를 확정 진단할 때 사용한다.

1. **원격 PC에서 포트 리스닝 확인**  
   `netstat -an | findstr 22222`  
   → `0.0.0.0:22222` 또는 `127.0.0.1:22222`가 LISTENING이어야 한다.

2. **TCP 연결 가능 여부 확인**  
   PowerShell: `Test-NetConnection -ComputerName 127.0.0.1 -Port 22222`  
   → `TcpTestSucceeded : True`인지 확인.

3. **Desktop 앱 실행** 후 Status 또는 Settings 화면에서 **WS URL (effective)** 값을 확인한다.  
   → `ws://127.0.0.1:22222/` 또는 설정한 `XIAOWEI_WS_URL`과 일치하는지 확인.

4. **WS Status**가 FAILED이면 **실패 원인**을 확인한다.  
   - TCP refused (서버 미실행/포트) → xiaowei.exe 미실행 또는 22222 미오픈.  
   - HTTP 400/404 (경로/핸드셰이크) → URL 경로/스키마 불일치.  
   - timeout → 이벤트/응답 지연.

5. **Agent 로그**에서 확정: `userData/logs/agent-stdout.log`  
   - `EFFECTIVE_WS_URL=...`, `CONNECT_ATTEMPT=<n>` (연결 시도 직전).  
   - 실패 시 `error.name`, `error.message`, `closeCode`, `closeReason`, `elapsedMs`, `url`, `failureCategory`.

6. **결론**: 로그의 `url`과 UI의 effective URL이 같고, netstat/Test-NetConnection과 포트가 일치하면, 실패 원인은 **URL/경로**가 아닌 **핸드셰이크 또는 timeout** 쪽으로 좁혀진다.
