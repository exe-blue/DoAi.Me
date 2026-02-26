# Task: Fix _watchVideoOnDevice in task-executor.js

## 문제 상황
Galaxy S9 (SM-G965U1, 해상도 1080x1920) 3대에서 YouTube 영상 자동 시청이 제대로 안 됨.

### 현재 증상
1. YouTube 영상 페이지는 열리지만 **재생이 안 됨** (일시정지 상태)
2. `tap(serial, 50, 50)`이 **상태바/앱관리자**를 터치해서 최근 앱 화면이 열림
3. **광고 건너뛰기 버튼**을 찾지 못함
4. 재생 중인지 판단하는 로직이 전혀 없음

## 수정 대상 파일
`agent/task-executor.js` — `_watchVideoOnDevice` 메서드

## 현재 코드 (문제)
```javascript
async _watchVideoOnDevice(serial, videoUrl, durationSec) {
    const startTime = Date.now();
    await this.xiaowei.adbShell(serial, `am start -a android.intent.action.VIEW -d '${videoUrl}'`);
    await _sleep(_randInt(4000, 7000));
    await this.xiaowei.tap(serial, 50, 50);  // ← 상태바 터치! 앱관리자 열림
    await _sleep(1000);
    // 그냥 대기만 함 - 광고 스킵 없음, 재생 확인 없음
    const targetMs = durationSec * 1000;
    let elapsed = 0;
    while (elapsed < targetMs) {
        const waitMs = Math.min(_randInt(10000, 40000), targetMs - elapsed);
        await _sleep(waitMs);
        elapsed += waitMs;
    }
    await this.xiaowei.goHome(serial);
    await _sleep(500);
    const actualDurationSec = Math.round((Date.now() - startTime) / 1000);
    const watchPercentage = durationSec > 0 ? Math.min(100, Math.round((actualDurationSec / durationSec) * 100)) : 0;
    return { actualDurationSec, watchPercentage };
}
```

## 수정 요구사항

### 1. YouTube 앱으로 영상 열기 (기존 OK)
```javascript
await this.xiaowei.adbShell(serial, `am start -a android.intent.action.VIEW -d '${videoUrl}'`);
```

### 2. 영상 터치 좌표 수정 (핵심!)
Galaxy S9 해상도는 1080x1920. YouTube 앱에서:
- **영상 플레이어 중앙**: `(540, 350)` — 터치하면 재생/일시정지 토글
- **절대 터치하면 안 되는 곳**: `(50, 50)` — 상태바, 앱관리자 열림
- **광고 건너뛰기 버튼 위치**: 우측 하단 `(900~1000, 580~650)` 근처

### 3. 광고 감지 및 건너뛰기
ADB로 화면 UI 텍스트를 덤프해서 광고 건너뛰기 버튼을 찾을 수 있음:
```javascript
// UI 덤프로 "건너뛰기" 또는 "Skip" 텍스트가 있는지 확인
const resp = await this.xiaowei.adbShell(serial, 
    `uiautomator dump /dev/tty 2>/dev/null | grep -oE '(건너뛰기|Skip|skip|광고 건너뛰기|Skip Ad|Skip ad)'`
);
```
또는 더 간단하게, 영상 시작 후 5~6초 후 광고 건너뛰기 버튼 위치를 눌러보기:
```javascript
// 광고 건너뛰기 버튼 위치를 반복 터치 (있으면 눌림, 없으면 무시됨)
await this.xiaowei.adbShell(serial, `input tap 960 580`);
```

### 4. 재생 확인 및 재시도
영상이 로드된 후 플레이어 중앙을 터치하여 재생:
```javascript
// 영상 플레이어 중앙 터치 (컨트롤 표시)
await this.xiaowei.adbShell(serial, `input tap 540 350`);
await _sleep(500);
// 재생 버튼 위치 터치 (중앙의 재생 아이콘)
await this.xiaowei.adbShell(serial, `input tap 540 350`);
```

### 5. 시청 중 주기적 활동 (화면 꺼짐 방지 + 광고 스킵)
대기 루프에서 주기적으로:
- 화면 깨우기 (screen on 유지)
- 광고 건너뛰기 시도
- 가끔 화면 터치 (봇 감지 방지)

### 6. 요구하는 최종 구현

```javascript
async _watchVideoOnDevice(serial, videoUrl, durationSec) {
    const startTime = Date.now();

    // 1. 화면 깨우기
    await this.xiaowei.adbShell(serial, `input keyevent KEYCODE_WAKEUP`);
    await _sleep(1000);

    // 2. YouTube 앱으로 영상 열기
    await this.xiaowei.adbShell(serial, `am start -a android.intent.action.VIEW -d '${videoUrl}'`);
    await _sleep(_randInt(5000, 8000)); // 로딩 대기 (넉넉하게)

    // 3. 초기 광고 건너뛰기 시도 (5초 광고 대기 후)
    await this._trySkipAd(serial);

    // 4. 영상 재생 확인 — 플레이어 중앙 터치 (재생/일시정지 토글)
    await this._ensurePlaying(serial);

    // 5. 시청 루프 — 주기적으로 광고 스킵 + 화면 유지
    const targetMs = durationSec * 1000;
    let elapsed = 0;
    const AD_CHECK_INTERVAL = 15000; // 15초마다 광고 체크
    const WAKEUP_INTERVAL_MS = 30000;
    let lastWakeup = 0;

    while (elapsed < targetMs) {
        const waitMs = Math.min(AD_CHECK_INTERVAL, targetMs - elapsed);
        await _sleep(waitMs);
        elapsed += waitMs;

        // 광고 건너뛰기 시도
        await this._trySkipAd(serial);

        // 30초마다 화면 깨우기 (화면 꺼짐 방지, 봇 감지 방지)
        if (elapsed - lastWakeup >= WAKEUP_INTERVAL_MS) {
            await this.xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
            lastWakeup = elapsed;
        }
    }

    // 6. 홈으로 돌아가기
    await this.xiaowei.goHome(serial);
    await _sleep(500);

    const actualDurationSec = Math.round((Date.now() - startTime) / 1000);
    const watchPercentage = durationSec > 0 ? Math.min(100, Math.round((actualDurationSec / durationSec) * 100)) : 0;
    return { actualDurationSec, watchPercentage };
}

/**
 * 광고 건너뛰기 시도
 * Galaxy S9 (1080x1920) 기준 좌표
 */
async _trySkipAd(serial) {
    try {
        // 방법 1: uiautomator로 "건너뛰기" 버튼 텍스트 확인
        const result = await this.xiaowei.adbShell(serial,
            `uiautomator dump /dev/tty 2>/dev/null`
        );
        const xmlStr = (result && result.data) ? String(result.data) : '';

        if (xmlStr.includes('건너뛰기') || xmlStr.includes('Skip') || xmlStr.includes('skip ad')) {
            // 광고 건너뛰기 버튼 터치 (우측 하단 영역)
            await this.xiaowei.adbShell(serial, `input tap 960 580`);
            console.log(`[TaskExecutor] Ad skip tapped on ${serial}`);
            await _sleep(1500);
        }

        // 방법 2: "동영상 뒤에 재생됩니다" 팝업 닫기
        if (xmlStr.includes('닫기') || xmlStr.includes('Close') || xmlStr.includes('dismiss')) {
            await this.xiaowei.adbShell(serial, `input tap 540 1400`);
            await _sleep(500);
        }
    } catch (err) {
        // uiautomator 실패해도 무시 — 좌표 기반 터치로 폴백
        await this.xiaowei.adbShell(serial, `input tap 960 580`);
        await _sleep(500);
    }
}

/**
 * 재생 상태 확인 및 재생 시작
 * Galaxy S9 (1080x1920) 기준 좌표
 */
async _ensurePlaying(serial) {
    try {
        // 영상 플레이어 영역 터치 (컨트롤 표시)
        await this.xiaowei.adbShell(serial, `input tap 540 350`);
        await _sleep(1500);

        // uiautomator로 "일시중지" 또는 "재생" 상태 확인
        const result = await this.xiaowei.adbShell(serial,
            `uiautomator dump /dev/tty 2>/dev/null`
        );
        const xmlStr = (result && result.data) ? String(result.data) : '';

        // "재생" 버튼이 보이면 = 현재 일시정지 상태 → 터치해서 재생
        if (xmlStr.includes('재생') || xmlStr.includes('Play')) {
            await this.xiaowei.adbShell(serial, `input tap 540 350`);
            console.log(`[TaskExecutor] Play button tapped on ${serial}`);
            await _sleep(1000);
        }

        // "일시중지" 버튼이 보이면 = 현재 재생 중 → OK
        // 아무것도 안 보이면 한 번 더 터치
        if (!xmlStr.includes('일시중지') && !xmlStr.includes('Pause')) {
            await this.xiaowei.adbShell(serial, `input tap 540 350`);
            await _sleep(500);
        }
    } catch (err) {
        // 폴백: 그냥 플레이어 중앙 더블터치
        await this.xiaowei.adbShell(serial, `input tap 540 350`);
        await _sleep(500);
        await this.xiaowei.adbShell(serial, `input tap 540 350`);
    }
}
```

## 사용 가능한 Xiaowei API 메서드
- `this.xiaowei.adbShell(serial, command)` — ADB shell 명령 실행
- `this.xiaowei.tap(serial, x, y)` — 화면 터치 (Xiaowei 자체)
- `this.xiaowei.goHome(serial)` — 홈 버튼
- `this.xiaowei.screen(serial)` — 스크린샷

## ADB 유용한 명령어 참고
```bash
# 화면 깨우기
input keyevent KEYCODE_WAKEUP
# 화면 터치
input tap 540 350
# 스와이프
input swipe 540 1200 540 600 300
# 뒤로가기
input keyevent KEYCODE_BACK
# 홈
input keyevent KEYCODE_HOME
# UI 덤프 (XML)
uiautomator dump /dev/tty
# 현재 포커스된 앱 확인
dumpsys window | grep mCurrentFocus
# YouTube 강제 종료
am force-stop com.google.android.youtube
# MediaSession 상태 확인 (재생 중인지)
dumpsys media_session | grep -E 'state=|PlaybackState'
```

## 주의사항
- `this.xiaowei.tap()` 대신 `this.xiaowei.adbShell(serial, 'input tap x y')` 사용 권장 (더 안정적)
- `uiautomator dump`는 시간이 걸릴 수 있음 (1~3초) — 너무 자주 호출하지 말 것
- Galaxy S9 해상도: 1080x1920 기준 좌표
- `_trySkipAd`와 `_ensurePlaying`은 `_watchVideoOnDevice` 바로 아래에 새 메서드로 추가
- 기존 `execute()`, `_dispatch()` 등 다른 메서드는 수정하지 말 것
