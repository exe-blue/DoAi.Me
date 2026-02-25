# Xiaowei WebSocket API 레퍼런스

## 연결
- URL: `ws://127.0.0.1:22222/`
- 활성화: `%APPDATA%\xiaowei_wecan88888\config.toml`에 `[websocket] port=22222` 추가 후 앱 재시작
- 인증: VIP 회원 활성화 필요 (미활성 시 code=10001)

## 응답 형식
```json
{ "code": 10000, "message": "SUCCESS", "data": [...] }
```

### 응답 코드
- `10000`: 성공
- `10001`: 회원 미활성화 ("请激活会员后使用")

## xiaowei-client.js 메서드

### 디바이스 관리
```javascript
xiaowei.list()                           // 연결된 디바이스 목록
xiaowei.screen(serial, savePath?)        // 스크린샷
```

### ADB 명령
```javascript
xiaowei.adbShell(serial, command)        // ADB shell 명령 실행
xiaowei.adb(serial, command)             // ADB 명령 (non-shell)
```

### 터치/이벤트
```javascript
xiaowei.tap(serial, x, y)               // 화면 터치 (Xiaowei 좌표계)
xiaowei.goHome(serial)                   // 홈 버튼
xiaowei.pushEvent(serial, type)          // 0=back, 1=home, 2=recents
```

### 앱 관리
```javascript
xiaowei.startApk(serial, packageName)    // 앱 실행
xiaowei.stopApk(serial, packageName)     // 앱 종료
xiaowei.installApk(serial, filePath)     // APK 설치
```

### 스크립트/액션
```javascript
xiaowei.actionCreate(devices, actionName, options)  // Xiaowei 사전정의 액션
xiaowei.autojsCreate(devices, scriptPath, options)  // AutoJS 스크립트 실행
```

### Options 구조
```javascript
{
  count: 1,                        // 반복 횟수
  taskInterval: [1000, 3000],      // 태스크 간 대기 (ms, [min, max])
  deviceInterval: "500",           // 디바이스 간 대기 (ms)
}
```

## ADB Shell 주요 명령어 (Galaxy S9, 1080x1920)

### 앱 제어
```bash
am start -a android.intent.action.VIEW -d 'https://www.youtube.com/watch?v=VIDEO_ID'
am force-stop com.google.android.youtube
```

### 입력
```bash
input tap 540 350                  # 화면 터치
input swipe 540 1200 540 600 300   # 스와이프 (x1 y1 x2 y2 duration_ms)
input keyevent KEYCODE_WAKEUP      # 화면 깨우기
input keyevent KEYCODE_HOME        # 홈
input keyevent KEYCODE_BACK        # 뒤로
input keyevent KEYCODE_ENTER       # 엔터
input text 'hello'                 # 텍스트 입력
```

### 상태 확인
```bash
uiautomator dump /dev/tty          # UI 트리 XML 덤프
dumpsys media_session | grep -E 'state=|PlaybackState'  # 재생 상태
dumpsys window | grep mCurrentFocus  # 현재 포커스된 앱
dumpsys battery                    # 배터리 상태
```

## Galaxy S9 YouTube 좌표 맵
```
┌─────────────────────────────┐
│ (540, 25) 상태바 ❌ 터치금지  │  0
│                             │
│  ┌───────────────────────┐  │
│  │                       │  │  100
│  │   YouTube 플레이어     │  │
│  │   (540, 350) 중앙     │  │  350
│  │                       │  │
│  │         (960, 580) 광고│  │  580
│  └───────────────────────┘  │  640
│                             │
│  제목 / 채널 정보            │  800
│  좋아요/싫어요 버튼          │  900
│  (200, 900)👍  (400, 900)👎 │
│                             │
│  댓글 영역                   │  1200
│  (540, 1200)               │
│                             │
│  추천 영상                   │  1500
│                             │
│  ───────────────────────── │  1820
│  ◁    □    △  네비바       │  1880
└─────────────────────────────┘  1920
```
