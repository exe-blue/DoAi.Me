# Xiaowei WebSocket API 레퍼런스

**모든 디바이스 제어 명령은 Xiaowei WebSocket을 통해서만 수행한다.** 상세 스키마·요청/응답 형식은 [xiaowei_client.md](xiaowei_client.md) 참조. JSON 메시지 검증은 **https://wstool.js.org/** 에서 `ws://127.0.0.1:22222/` 연결 후 요청/응답을 확인할 수 있다.

---

## 1. 연결

| 항목 | 내용 |
|------|------|
| URL (Android) | `ws://127.0.0.1:22222/` |
| URL (iOS) | `ws://127.0.0.1:33333/` |
| 프로토콜 | WebSocket, JSON |
| 인증 | 로컬 전용(없음). VIP 미활성 시 `code: 10001` 반환 |

활성화: `%APPDATA%\xiaowei_wecan88888\config.toml`에 `[websocket] port=22222` 추가 후 앱 재시작.

---

## 2. 응답 형식 (공통)

요청마다 JSON 응답이 내려온다. (xiaowei_client.md §2.3)

**성공 예시**

```json
{ "code": 10000, "message": "SUCCESS", "data": [...] }
```

**실패 예시**

```json
{ "code": 10001, "message": "请激活会员后使用", "data": null }
```

### 응답 코드 (§8.2)

| code | 의미 |
|------|------|
| **10000** | 성공 (SUCCESS) |
| **10001** | 실패 (회원 미활성화, 잘못된 action/파라미터, 파일 미존재 등) |

클라이언트는 `code === 10000` 여부로 성공/실패를 판단하고, `data`가 필요한 경우 JSON 구조를 위 웹소켓 확인 사이트나 `xiaowei_client.md`·`docs/xiaowei_request_response.json`을 참고한다.

---

## 3. 디바이스 타겟 (devices)

| 값 | 설명 |
|----|------|
| `all` | 연결된 전체 기기 |
| `serialA,serialB` | 쉼표로 구분한 다중 시리얼 |
| `IP:PORT` | WiFi/OTG 등에서 시리얼 대신 사용 (예: `192.168.1.100:5555`) |

권장: `list`로 기기 목록 조회 후 응답의 **onlySerial**을 안정적 식별자로 사용.

---

## 4. xiaowei-client.js 메서드 (Agent 사용)

모든 호출은 Xiaowei WebSocket으로 전송되며, 응답은 `code: 10000` / `10001` 및 `data`로 내려온다.

### 4.1 디바이스 관리

| 메서드 | 설명 | 비고 |
|--------|------|------|
| `xiaowei.list()` | 연결된 디바이스 목록 | 응답 data 배열, onlySerial 권장 |
| `xiaowei.screen(devices, savePath?)` | 스크린샷 | data.savePath (PC 경로) |

### 4.2 xiaowei.adb / adb_shell

| 메서드 | 설명 | action |
|--------|------|--------|
| `xiaowei.adbShell(devices, command)` | 기기에서 ADB shell 명령 실행 | adb_shell |
| `xiaowei.xiaoweiAdb(devices, command)` | 호스트에서 전체 adb 명령 (connect, disconnect 등) | xiaowei.adb |

adb_shell 응답: `{ code: 10000, data: { [serial]: "출력\n" } }` 형태로 확인. (xiaowei_client.md §2.3, §8.2)

### 4.3 터치/이벤트

| 메서드 | 설명 |
|--------|------|
| `xiaowei.tap(devices, x, y)` | 화면 터치 |
| `xiaowei.goHome(devices)` | 홈 (pushEvent type "2") |
| `xiaowei.goBack(devices)` | 뒤로 (pushEvent type "3") |
| `xiaowei.recentApps(devices)` | 최근 앱 (pushEvent type "1") |
| `xiaowei.pushEvent(devices, type)` | 1=최근앱, 2=홈, 3=뒤로 |
| `xiaowei.pointerEvent(devices, type, x, y)` | 터치/스와이프/스크롤 (type 0~9) |

### 4.4 앱 관리

| 메서드 | 설명 |
|--------|------|
| `xiaowei.startApk(devices, packageName)` | 앱 실행 |
| `xiaowei.stopApk(devices, packageName)` | 앱 종료 |
| `xiaowei.installApk(devices, filePath)` | APK 설치 (PC 경로) |

### 4.5 스크립트/자동화 (v8.288+)

| 메서드 | 설명 |
|--------|------|
| `xiaowei.actionCreate(devices, actionName, options)` | Xiaowei 사전정의 액션 |
| `xiaowei.autojsCreate(devices, scriptPath, options)` | AutoJS 스크립트 실행 |

Options: `count`, `taskInterval`, `deviceInterval` 등 (xiaowei_client.md 참조).

---

## 5. ADB Shell 주요 명령어 (참고)

Galaxy S9 등 1080x1920 기준. 실제 실행은 반드시 `xiaowei.adbShell(devices, command)`로 한다.

- 앱: `am start -a android.intent.action.VIEW -d 'https://...'`, `am force-stop com.google.android.youtube`
- 입력: `input tap 540 350`, `input swipe ...`, `input keyevent KEYCODE_HOME`, `input text 'hello'`
- 상태: `dumpsys battery`, `dumpsys window | grep mCurrentFocus`, `uiautomator dump /dev/tty`

---

## 6. 문서/리소스

- **요청·응답 봉투·Action 목록**: [xiaowei_client.md](xiaowei_client.md) §2, §4, §5, §8.2
- **WebSocket 테스트**: https://wstool.js.org/
- **스키마(선택)**: `docs/xiaowei_request_response.json`
- **코드 상수**: `apps/desktop/src/agent/core/xiaowei-constants.js`, 웹: `apps/web/src/lib/ws-api-response.ts`
