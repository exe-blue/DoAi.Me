# Task: 좌표 기반 → UI 오브젝트 기반 자동화로 전면 전환

## 수정 파일
`agent/task-executor.js`

## 핵심 변경

| 기존 (좌표) | 새로운 (오브젝트) |
|-------------|------------------|
| `input tap 930 80` (검색) | `_findAndTap(serial, { resourceId: '...search_button' })` |
| `input tap 960 580` (광고 스킵) | `_findAndTap(serial, { resourceId: '...skip_ad_button' })` |
| `input tap 540 350` (재생) | `_findAndTap(serial, { contentDesc: '재생' })` |
| 가로/세로 깨짐 | 가로/세로 모두 동작 ✅ |

**`_findAndTap`이 핵심 메서드** — uiautomator dump로 XML 파싱 → resource-id/content-desc로 요소 찾기 → bounds에서 중심좌표 계산 → 터치. 화면 방향 무관하게 동작함.

참고: YouTube UI 요소 ID/설명은 `docs/youtube-ui-objects.md` 참고.

## 새 유틸리티 메서드: _findAndTap

```javascript
/**
 * UI 요소를 찾아서 터치하는 범용 메서드
 * uiautomator dump로 XML을 얻고, resource-id 또는 content-desc로 요소를 찾아
 * bounds에서 중심 좌표를 계산하여 터치
 * 
 * @param {string} serial
 * @param {object} selector - { resourceId, contentDesc, textContains } 중 하나 이상
 * @param {number} [retries=2] - 재시도 횟수
 * @returns {Promise<boolean>} - 요소를 찾아서 터치했으면 true
 */
async _findAndTap(serial, selector, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // 1. UI 덤프
            await this.xiaowei.adbShell(serial, 'uiautomator dump /sdcard/window_dump.xml');
            await _sleep(500);
            const dumpRes = await this.xiaowei.adbShell(serial, 'cat /sdcard/window_dump.xml');
            const xml = this._extractShellOutput(dumpRes);
            if (!xml) continue;

            // 2. 요소 찾기
            let pattern = null;
            if (selector.resourceId) {
                pattern = new RegExp(
                    `resource-id="${selector.resourceId}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
                    'i'
                );
            } else if (selector.contentDesc) {
                // content-desc 부분 매칭
                pattern = new RegExp(
                    `content-desc="[^"]*${selector.contentDesc}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
                    'i'
                );
            } else if (selector.textContains) {
                pattern = new RegExp(
                    `text="[^"]*${selector.textContains}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
                    'i'
                );
            }

            if (!pattern) return false;

            // bounds가 resource-id보다 앞에 올 수도 있으므로 양방향 매칭
            let match = xml.match(pattern);
            if (!match) {
                // bounds가 속성 앞에 있는 경우를 위한 역방향 패턴
                if (selector.resourceId) {
                    const altPattern = new RegExp(
                        `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*resource-id="${selector.resourceId}"`,
                        'i'
                    );
                    match = xml.match(altPattern);
                } else if (selector.contentDesc) {
                    const altPattern = new RegExp(
                        `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*content-desc="[^"]*${selector.contentDesc}[^"]*"`,
                        'i'
                    );
                    match = xml.match(altPattern);
                } else if (selector.textContains) {
                    const altPattern = new RegExp(
                        `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*text="[^"]*${selector.textContains}[^"]*"`,
                        'i'
                    );
                    match = xml.match(altPattern);
                }
            }

            if (!match) {
                if (attempt < retries) {
                    await _sleep(1000);
                    continue;
                }
                return false;
            }

            // 3. 중심 좌표 계산
            const x1 = parseInt(match[1]);
            const y1 = parseInt(match[2]);
            const x2 = parseInt(match[3]);
            const y2 = parseInt(match[4]);
            const cx = Math.round((x1 + x2) / 2);
            const cy = Math.round((y1 + y2) / 2);

            // 4. 터치
            await this.xiaowei.adbShell(serial, `input tap ${cx} ${cy}`);
            return true;

        } catch (err) {
            if (attempt < retries) {
                await _sleep(1000);
                continue;
            }
            console.warn(`[TaskExecutor] _findAndTap error: ${err.message}`);
            return false;
        }
    }
    return false;
}

/**
 * UI 덤프에서 특정 요소가 존재하는지만 확인 (터치 안 함)
 */
async _hasElement(serial, selector) {
    try {
        await this.xiaowei.adbShell(serial, 'uiautomator dump /sdcard/window_dump.xml');
        await _sleep(500);
        const dumpRes = await this.xiaowei.adbShell(serial, 'cat /sdcard/window_dump.xml');
        const xml = this._extractShellOutput(dumpRes);
        if (!xml) return false;

        if (selector.resourceId) return xml.includes(selector.resourceId);
        if (selector.contentDesc) return xml.includes(selector.contentDesc);
        if (selector.textContains) return xml.includes(selector.textContains);
        return false;
    } catch {
        return false;
    }
}
```

## YouTube UI 요소 (resource-id / content-desc)

```javascript
// 이 상수들을 TaskExecutor 클래스 바깥 상단에 선언
const YT = {
    SEARCH_BUTTON:    { resourceId: 'com.google.android.youtube:id/menu_item_1' },       // 검색 아이콘 (메뉴)
    SEARCH_BUTTON_ALT:{ contentDesc: '검색' },                                            // content-desc 폴백
    SEARCH_EDIT_TEXT: { resourceId: 'com.google.android.youtube:id/search_edit_text' },   // 검색 입력창
    SEARCH_EDIT_ALT:  { className: 'android.widget.EditText' },                           // 폴백
    SKIP_AD:          { resourceId: 'com.google.android.youtube:id/skip_ad_button' },     // 광고 건너뛰기
    SKIP_AD_ALT:      { contentDesc: '건너뛰기' },                                        // content-desc 폴백
    PLAY_PAUSE:       { resourceId: 'com.google.android.youtube:id/player_control_play_pause_replay_button' },
    PLAY_PAUSE_ALT:   { contentDesc: '재생' },                                            // "재생" = 현재 일시정지 상태
    PAUSE_ALT:        { contentDesc: '일시중지' },                                         // "일시중지" = 현재 재생 중
    PLAYER:           { resourceId: 'com.google.android.youtube:id/player_fragment_container' },
    VIDEO_TITLE:      { resourceId: 'com.google.android.youtube:id/video_title' },
};
```

## _searchAndSelectVideo 수정 (좌표 제거, 오브젝트 기반)

```javascript
async _searchAndSelectVideo(serial, query) {
    try {
        // 1. 검색 버튼 터치 (resource-id 우선, content-desc 폴백)
        let found = await this._findAndTap(serial, YT.SEARCH_BUTTON);
        if (!found) {
            found = await this._findAndTap(serial, YT.SEARCH_BUTTON_ALT);
        }
        if (!found) {
            console.warn(`[TaskExecutor] ⚠ ${serial} search button not found`);
            return false;
        }
        await _sleep(1500);

        // 2. 검색 입력창에 텍스트 입력
        //    입력창이 이미 포커스되어 있으므로 바로 텍스트 입력
        await this._inputText(serial, query);
        await _sleep(1000);

        // 3. 엔터 (검색 실행)
        await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_ENTER');
        await _sleep(_randInt(3000, 5000));

        // 4. 첫 번째 검색 결과 터치
        //    검색 결과는 resource-id가 없으므로 video_title로 찾기
        //    또는 검색 결과 화면에서 스크롤 후 첫 번째 영상 썸네일 터치
        found = await this._findAndTap(serial, YT.VIDEO_TITLE);
        if (!found) {
            // 폴백: 검색 결과 첫 번째 위치를 상대적으로 터치
            // 검색 바 아래 첫 번째 콘텐츠 영역
            // 화면 높이의 약 40% 지점 (가로/세로 무관하게 상대 좌표)
            const screenInfo = await this._getScreenSize(serial);
            const tapX = Math.round(screenInfo.width / 2);
            const tapY = Math.round(screenInfo.height * 0.4);
            await this.xiaowei.adbShell(serial, `input tap ${tapX} ${tapY}`);
        }
        await _sleep(_randInt(3000, 5000));

        console.log(`[TaskExecutor] ✓ ${serial} search + select done`);
        return true;
    } catch (err) {
        console.error(`[TaskExecutor] ✗ ${serial} search failed: ${err.message}`);
        return false;
    }
}

/**
 * 화면 크기 가져오기 (가로/세로 자동 대응)
 */
async _getScreenSize(serial) {
    try {
        const res = await this.xiaowei.adbShell(serial, 'wm size');
        const output = this._extractShellOutput(res);
        const match = output && output.match(/(\d+)x(\d+)/);
        if (match) {
            return { width: parseInt(match[1]), height: parseInt(match[2]) };
        }
    } catch {}
    return { width: 1080, height: 1920 }; // Galaxy S9 기본값 폴백
}
```

## _trySkipAd 수정 (오브젝트 기반)

```javascript
async _trySkipAd(serial) {
    try {
        // resource-id로 건너뛰기 버튼 찾기
        let skipped = await this._findAndTap(serial, YT.SKIP_AD, 0);
        if (skipped) {
            console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (resource-id)`);
            await _sleep(1500);
            return;
        }

        // content-desc 폴백
        skipped = await this._findAndTap(serial, YT.SKIP_AD_ALT, 0);
        if (skipped) {
            console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (content-desc)`);
            await _sleep(1500);
            return;
        }

        // "Skip" 영문 폴백
        skipped = await this._findAndTap(serial, { contentDesc: 'Skip' }, 0);
        if (skipped) {
            console.log(`[TaskExecutor] ⏭ ${serial} ad skipped (Skip)`);
            await _sleep(1500);
        }
    } catch (err) {
        // 광고 없으면 무시
    }
}
```

## _ensurePlaying 수정 (오브젝트 기반)

```javascript
async _ensurePlaying(serial) {
    try {
        // 먼저 플레이어 영역을 터치해서 컨트롤 표시
        await this._findAndTap(serial, YT.PLAYER, 0);
        await _sleep(1500);

        // "재생" 버튼이 보이면 = 현재 일시정지 → 터치해서 재생
        const playFound = await this._findAndTap(serial, YT.PLAY_PAUSE_ALT, 0);
        if (playFound) {
            console.log(`[TaskExecutor] ▶ ${serial} play button tapped`);
            await _sleep(1000);
            return;
        }

        // "일시중지" 버튼이 보이면 = 현재 재생 중 → OK
        const isPaused = await this._hasElement(serial, YT.PAUSE_ALT);
        if (isPaused) {
            // 이미 재생 중
            return;
        }

        // 아무것도 못 찾으면 플레이어 중앙 터치 시도
        await this._findAndTap(serial, YT.PLAYER, 0);
        await _sleep(500);
        await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
    } catch (err) {
        // dumpsys 폴백
        try {
            const res = await this.xiaowei.adbShell(serial,
                "dumpsys media_session | grep -E 'state='");
            const output = this._extractShellOutput(res);
            if (output && output.includes('state=2')) {
                // state=2 = paused, 플레이어 터치
                await this._findAndTap(serial, YT.PLAYER, 0);
                await _sleep(500);
                await this._findAndTap(serial, YT.PLAY_PAUSE, 0);
            }
        } catch {}
    }
}
```

## _watchVideoOnDevice 수정

기존 `_watchVideoOnDevice`에서:
1. `input tap X Y` 좌표 터치 모두 제거
2. `_findAndTap` 또는 `_searchAndSelectVideo` 사용
3. 세로 모드 강제 (`accelerometer_rotation`, `user_rotation`)는 그대로 유지 (보험용)

## 수정하지 말 것
- `_pollJobAssignments` — 변경 없음
- `_executeJobAssignment` — _watchVideoOnDevice 파라미터만 유지
- `_buildSearchQuery` — 변경 없음
- `_inputText` — 변경 없음
- `_extractShellOutput` — 변경 없음

## 주의사항
- `uiautomator dump`는 1~3초 걸림. `_findAndTap`을 연속으로 빠르게 호출하면 안 됨
- resource-id는 YouTube 앱 버전에 따라 바뀔 수 있음 → content-desc 폴백 필수
- `_findAndTap`의 regex는 XML attribute 순서가 다를 수 있어서 양방향 매칭 필요
- 검색 결과 첫 번째 영상은 resource-id가 없을 수 있음 → `_getScreenSize`로 상대 좌표 사용
