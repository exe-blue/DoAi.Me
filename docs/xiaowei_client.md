<aside>
🧩

**문서 목적:** Xiaowei Screen Mirroring(효위투핑) 로컬 WebSocket API를 이용해 다수 모바일 기기를 제어·관리하는 시스템을 개발/연동하기 위한 단일 참조 문서입니다.

**독자:** 클라이언트/서버 개발자, 자동화(RPA) 구현자

**범위:** Android(22222) 중심, iOS(33333)는 차이점만 요약

</aside>

### 문서 스키마(Agent-friendly)

| 섹션 | 의미 | Agent가 주로 찾는 것 |
| --- | --- | --- |
| 1. Summary | 한 페이지 요약 | 무엇을, 어떤 방식으로, 어디에 연결하는지 |
| 2. Connection | 접속/포맷/공통 규약 | endpoint, payload, 응답 포맷 |
| 3. Device Targeting | devices 식별 방식 | serial, onlySerial, all, IP:port |
| 4. Action Catalog | Action 목록(분류) | 어떤 기능이 어떤 action인지 |
| 5. API Reference | 대표 API 상세 | request/response, 파라미터 표 |
| 6. Workflows | 자주 쓰는 흐름 | 연결→목록→제어→업로드 같은 시퀀스 |
| 7. Troubleshooting | 실패 원인/해결 | OTG/LAN/adb connect |
| 8. Appendix | 버전/코드/링크 | 오류 코드, 최소 버전, 외부 리소스 |

---

## 1. Summary

- **제품:** Xiaowei Screen Mirroring(효위투핑) 기반 다수 기기 동시 제어/관리
- **통신:** 로컬 전용 **WebSocket** + **JSON** 메시지 교환
- **주요 Android Endpoint:** `ws://127.0.0.1:22222/`
- **주요 iOS Endpoint:** `ws://127.0.0.1:33333/`
- **핵심 제약:** 로컬호스트(127.0.0.1) 전용이므로 원격에서 직접 호출 불가. 원격 연동은 별도 프록시/터널 레이어 필요.

---

## 2. Connection (공통 규약)

### 2.1 Endpoint

```
Android: ws://127.0.0.1:22222/
iOS:     ws://127.0.0.1:33333/
Protocol: WebSocket
Format:   JSON
Auth:     없음(로컬 전용)
```

### 2.2 Request Envelope

```json
{
  "action": "pushEvent",
  "devices": "all",
  "data": {
    "type": "2"
  }
}
```

### 2.3 Response Envelope

```json
{
  "code": 10000,
  "message": "SUCCESS",
  "data": null
}
```

### 2.4 공통 파라미터

| 필드 | 타입 | 필수 | 설명 |  |
| --- | --- | --- | --- | --- |
| action | string | ✅ | 요청 이벤트 타입 (대소문자 무관) |  |
| devices | string | ✅ | 대상 기기. all 또는 serial1,serial2 또는 IP:PORT |  |
| data | object | ❌ | 요청별 추가 파라미터 |  |

---

## 3. Device Targeting (devices 규칙)

- **"all"**: 연결된 전체 기기
- **"serialA,serialB"**: 쉼표로 다중 지정
- **"IP:PORT"**: WiFi/OTG 등에서 시리얼 대신 사용 가능
- 권장 흐름:
    
    1) `list`로 기기 목록 조회
    
    2) 응답의 `onlySerial`을 안정적 식별자로 사용
    

---

## 4. Action Catalog (기능별 Action 요약)

### 4.1 Device

- `list`: 장치 목록 조회
- `updateDevices`: 장치 정보 업데이트(이름/정렬 등)

### 4.2 Control

- `adb`: ADB 명령 실행(전체 커맨드)
- `adb_shell`: ADB shell 명령 실행
- `screen`: 스크린샷
- `pointerEvent`: 터치/스와이프/스크롤
- `pushEvent`: 홈/뒤로/최근앱

### 4.3 File

- `writeClipBoard`: 클립보드 전송
- `uploadFile`: PC → 모바일 업로드
- `pullFile`: 모바일 → PC 다운로드

### 4.4 App

- `apkList`: 앱 목록
- `installApk`: 설치
- `uninstallApk`: 제거
- `startApk`: 실행
- `stopApk`: 종료

### 4.5 IME

- `imeList`
- `installInputIme`
- `selectIme`
- `inputText`

### 4.6 Tag

- `getTags`
- `addTag`
- `updateTag`
- `removeTag`
- `addTagDevice`
- `removeTagDevice`

### 4.7 Task/Automation (v8.288+)

- `actionTasks`, `actionCreate`, `actionRemove`
- `autojsTasks`, `autojsCreate`, `autojsRemove`

---

## 5. API Reference (대표 상세)

### 5.1 list - 장치 목록 조회

**Request**

```json
{ "action": "list" }
```

**Response (예시)**

```json
{
  "code": 10000,
  "message": "SUCCESS",
  "data": [
    {
      "width": 272,
      "height": 480,
      "serial": "ea85356a",
      "model": "Redmi Note 3",
      "sort": 1,
      "name": "Redmi Note 33",
      "onlySerial": "ea85356a",
      "hide": false,
      "mode": 0,
      "status": "online",
      "connectTime": 1714294839013,
      "intranetIp": "192.168.111.143",
      "sourceWidth": 1080,
      "sourceHeight": 1920
    }
  ]
}
```

**Response data 필드**

| 필드 | 설명 |  |  |
| --- | --- | --- | --- |
| serial / onlySerial | 장치 식별자. onlySerial을 안정적으로 활용 권장 |  |  |
| mode | 0:USB, 1:WiFi, 2:OTG, 3:접근성, 10-12:클라우드 |  |  |
| intranetIp | 내부 IP |  |  |

---

### 5.2 screen - 스크린샷

| 필드 | 필수 | 설명 |  |
| --- | --- | --- | --- |
| action | ✅ | "screen" |  |
| devices | ✅ | "all" 또는 장치 식별자 |  |
| data.savePath | ❌ | PC 저장 경로 (기본: D:Pictures) |  |

**Request**

```json
{
  "action": "screen",
  "devices": "all",
  "data": { "savePath": "C:\\Users\\Administrator\\Desktop" }
}
```

---

### 5.3 pointerEvent - 화면 제어

| data.type | 의미 | x/y 필요 |
| --- | --- | --- |
| 0 | 누르기 | ✅ |
| 1 | 떼기 | ✅ |
| 2 | 이동 | ✅ |
| 4 | 휠 위 | ✅ |
| 5 | 휠 아래 | ✅ |
| 6 | 위 스와이프 | ❌ |
| 7 | 아래 스와이프 | ❌ |
| 8 | 왼쪽 스와이프 | ❌ |
| 9 | 오른쪽 스와이프 | ❌ |

**Request**

```json
{
  "action": "pointerEvent",
  "devices": "all",
  "data": {
    "type": "6",
    "x": "20",
    "y": "70"
  }
}
```

---

### 5.4 pushEvent - 빠른 작동

| data.type | 동작 |  |
| --- | --- | --- |
| 1 | 최근 앱 |  |
| 2 | 홈 |  |
| 3 | 뒤로 |  |

---

## 6. Workflows (자주 쓰는 시나리오)

### 6.1 개발자 Quickstart (문서 핵심 요약)

1. **연결 테스트**
    - Android: `ws://127.0.0.1:22222/`
    - 테스트 도구: https://wstool.js.org/
    - 연결 성공 확인: "opened" 메시지/팝업
2. **필수 전제 조건**
    - ✅ USB 디버깅 활성화 필요
    - ❌ 보안 모드 또는 접근성(무장애) 모드가 켜져 있으면 USB 디버깅이 비활성화될 수 있어 API 호출이 실패할 수 있음
    - ✅ `devices` 파라미터를 연결 방식에 맞게 정확히 지정
        - USB: 시리얼
        - WiFi/OTG: `IP:PORT` (예: `192.168.1.100:5555`)
3. **자주 쓰는 Action 묶음(실무 기준)**
    - 장치: `list`, `updateDevices`
    - 캡처/제어: `screen`, `pointerEvent`, `pushEvent`
    - 파일: `uploadFile`, `pullFile`, `writeClipBoard`
    - 앱: `apkList`, `installApk`, `uninstallApk`, `startApk`, `stopApk`
    - 입력(중요): `imeList`, `installInputIme`, `selectIme`, `inputText`
        - `inputText` 사용 전 `selectIme`로 투핑 입력기 선택을 권장
    - 태그(그룹 운영): `getTags`, `addTag`, `updateTag`, `removeTag`, `addTagDevice`, `removeTagDevice`
4. **응답 코드**
    - `10000`: 성공
    - `10001`: 실패(액션/파라미터/파일 경로 등)

### 6.2 대표 시나리오

1. **기기 조회 후 특정 기기 제어**
    - `list` → 원하는 장치의 `onlySerial` 확보 → `pointerEvent`/`pushEvent`/`screen`
2. **파일 전송**
    - `uploadFile`(PC→폰) 또는 `pullFile`(폰→PC)
3. **텍스트 입력 자동화**
    - `selectIme`(투핑 입력기) → `inputText` (줄바꿈: `\\n`)

### 6.3 스크린샷 "분석"에 대한 경계 (중요)

- `screen`은 **이미지 파일 저장**까지만 수행합니다.
- OCR, UI 요소 인식, 성공/실패 판정(예: 유튜브 시청 완료 여부)은 **외부 분석 레이어**(OCR/Computer Vision/모델 추론)가 필요합니다.
- 권장 분리:
    - (1) 효위 API: 캡처 생성 (`screen`)
    - (2) 외부 분석: 캡처 파일 읽기 → 판정 결과 저장

### 6.4 100대 운영 + 서버리스(Node.js) 연동 시 핵심 제약

- 본 API는 `127.0.0.1` 로컬호스트 WebSocket이므로 **서버리스 환경에서 직접 접속할 수 없습니다.**
- 권장 아키텍처:
    - **브릿지(중계) 머신**(효위 실행 환경)에서 WebSocket을 붙고
    - 서버리스 함수는 브릿지 머신의 HTTP 엔드포인트(프록시)를 호출하는 구조

---

## 7. Troubleshooting

### 7.1 OTG 연결(요약)

- (듀얼 보드 케이스) USB 모드 전환 → OTG 탭에서 활성화 → IP 추가/스캔
- (단일 보드 케이스) IP 입력 후 스캔만 수행

### 7.2 연결 실패 체크리스트

| 원인 | 확인/조치 |  |
| --- | --- | --- |
| 라우터 미연결 | 라우터 관리자에서 장치 연결 상태 확인 |  |
| LAN 불일치 | PC와 OTG 네트워크가 같은 LAN인지 확인 |  |
| 포트/디버깅 문제 | ping 테스트, 필요 시 adb connect 시도 |  |

**Ping 테스트(Windows)**

```bash
ping [장치_IP_주소]
```

**수동 연결(예시)**

```bash
adb connect [IP_주소]:5555
```

---

## 8. Appendix

### 8.1 버전 요구사항

| 기능 | 최소 버전 |  |
| --- | --- | --- |
| 기본 API | 모든 버전 |  |
| 작업 관리/AutoJS | v8.288+ |  |

### 8.2 오류 코드

| 코드 | 의미 |  |
| --- | --- | --- |
| 10000 | SUCCESS |  |
| 10001 | 실패(잘못된 action, 파라미터 오류, 파일 미존재 등) |  |

### 8.3 외부 리소스

- WebSocket 테스트: https://wstool.js.org/
- 공식 도움말: https://www.xiaowei.xin/help/