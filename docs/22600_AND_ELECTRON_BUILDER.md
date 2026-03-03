# 22600 vs electron-builder 정리

## 1. 22600이 정의된 파일/라인

| 파일 | 라인 | 내용 |
|------|------|------|
| `apps/desktop/src/main/main.ts` | 41–42 | `XIAOWEI_API_URL = process.env.XIAOWEI_API_URL ?? "http://127.0.0.1:22600/command"` |

- 레포 전체에서 **22600** 문자열은 위 한 곳에만 등장한다.
- `/command` 경로는 Xiaowei **HTTP API** 엔드포인트용이다 (list, adb, adb_shell 등 POST 호출).

## 2. electron-builder와 22600의 관계

- **electron-builder 관련 파일에는 22600이 없다.**
  - `apps/desktop/package.json`: 스크립트는 `electron-builder --win`, 의존성은 `"electron-builder": "^26.8.1"` (패키지 버전 26.8.1). 포트 번호 22600과 무관.
  - `apps/desktop` 내 `build`(extraResources, win, nsis 등): 포트/22600 문자열 없음.
  - `.github/workflows/release-desktop.yml`: `electron-builder --win` 실행만 있으며 22600 미등장.
- **git diff로 확인한 내용**
  - `package.json` diff: 스크립트 추가/수정(bundle:agent, prepare-packaged-env), extraResources를 `agent-dist`/`release.env`로 변경. **22600 또는 포트 번호 추가/변경 없음.**
  - `release-desktop.yml` diff: agent 의존성 설치 대신 `prepare-packaged-env.js` + `bundle:agent` 실행으로 변경. **22600 미등장.**
- **결론:** “electron-builder 문자열이 22600으로 바뀐 것처럼 보인다”는 **오해**이다. electron-builder 설정/스크립트/워크플로에는 22600이 섞인 적이 없고, 26.8.1은 npm 패키지 버전이다.

## 3. 22600의 용도와 PRE_CHECK 변경

- **22600**은 Xiaowei **HTTP API** 주소(기본 `http://127.0.0.1:22600/command`)로, 레거시/옵션용이다.
- **연결 판단(READINESS/PRE_CHECK)** 은 이미 **WS 22222** 기반으로 바뀌어 있다.
  - `main.ts`에서 `xiaoweiWsPreCheck()`로 `XIAOWEI_WS_URL`(기본 `ws://127.0.0.1:22222/`)에 WebSocket 연결해 open/101 성공 시에만 “연결됨”으로 간주.
  - 22600 HTTP는 **readiness gate에 사용하지 않으며**, device list / adb 명령 등이 필요할 때만 `xiaoweiRequest()`로 호출된다(옵션).

## 4. 수정 필요 여부

- **추가 수정 불필요.** PRE_CHECK는 이미 WS 22222 기반으로 동작한다.
- 22600은 `XIAOWEI_API_URL` 기본값으로만 남아 있으며, env로 덮을 수 있고, readiness에는 사용되지 않는다.
