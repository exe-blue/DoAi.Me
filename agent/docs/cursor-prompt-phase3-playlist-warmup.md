# Phase 3: 재생목록 저장 + 워밍업 시퀀스

## 전제조건
- Phase 1 (좋아요/구독 + 확률 시스템) 완료
- Phase 2 (댓글 시스템) 완료
- `_doLike`, `_doSubscribe`, `_doComment`, `_getPersonality`, `_calcProb`, `CommentGenerator` 등 이미 존재

## 수정 파일
- `agent/task-executor.js` — 주 수정

## 참조 문서
- `@docs/engagement-system-design.md` — 전체 설계서
- `@docs/youtube-ui-objects.md` — UI 오브젝트 레퍼런스

---

## Part A: 재생목록 저장

### 수정 1: YT 상수에 재생목록 관련 추가

기존 YT 객체에 추가:
```javascript
SAVE_PLAYLIST:     { resourceId: 'com.google.android.youtube:id/save_to_playlist_button' },
SAVE_PLAYLIST_ALT: { contentDesc: '재생목록에 저장' },
WATCH_LATER:       { textContains: '나중에 볼 동영상' },
```

### 수정 2: _doSavePlaylist 메서드 추가

```javascript
/**
 * 재생목록에 저장 실행
 * @param {string} serial
 * @returns {Promise<boolean>} 성공 여부
 */
async _doSavePlaylist(serial) {
    try {
        // 1. 저장 버튼 찾기 + 터치
        let found = await this._findAndTap(serial, YT.SAVE_PLAYLIST, 1);
        if (!found) {
            found = await this._findAndTap(serial, YT.SAVE_PLAYLIST_ALT, 1);
        }
        if (!found) {
            console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} playlist save button not found`);
            return false;
        }
        await _sleep(_randInt(1500, 2500));

        // 2. "나중에 볼 동영상" 선택
        const selected = await this._findAndTap(serial, YT.WATCH_LATER, 1);
        if (selected) {
            await _sleep(_randInt(1000, 1500));
            console.log(`[Engagement] 📋 ${serial.substring(0, 6)} saved to Watch Later`);
        } else {
            // 팝업이 다를 수 있음 — 그냥 첫 번째 항목 터치 또는 뒤로가기
            const screen = await this._getScreenSize(serial);
            await this.xiaowei.adbShell(serial,
                `input tap ${Math.round(screen.width / 2)} ${Math.round(screen.height * 0.4)}`
            );
            await _sleep(_randInt(1000, 1500));
            console.log(`[Engagement] 📋 ${serial.substring(0, 6)} saved to playlist (first option)`);
        }

        return true;
    } catch (err) {
        console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} playlist save failed: ${err.message}`);
        try { await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_BACK'); } catch {}
        return false;
    }
}
```

### 수정 3: _watchVideoOnDevice 시청 루프에 재생목록 통합

기존 `// Phase 3: 재생목록` 주석이 있는 부분 수정.

확률 판정 블록에 추가:
```javascript
    const willPlaylist = Math.random() < this._calcProb(eng.probPlaylist || DEFAULT_PROBS.playlist, personality.playlistMult);
    const playlistAtSec = durationSec * (_randInt(85, 95) / 100);
```

로그에 추가:
```javascript
    if (willLike || willComment || willSubscribe || willPlaylist) {
        console.log(`[Engagement] ${serial.substring(0, 6)} [${personality.type}] plan: ` +
            `like=${willLike}@${Math.round(likeAtSec)}s ` +
            `comment=${willComment && !!commentText}@${Math.round(commentAtSec)}s ` +
            `sub=${willSubscribe}@${Math.round(subscribeAtSec)}s ` +
            `playlist=${willPlaylist}@${Math.round(playlistAtSec)}s`);
    }
```

시청 루프 내에서 `// Phase 3: 재생목록` 주석을 교체:
```javascript
        // 재생목록 저장 (시점 도달 시)
        if (willPlaylist && !actions.playlisted && elapsedSec >= playlistAtSec) {
            actions.playlisted = await this._doSavePlaylist(serial);
        }
```

---

## Part B: 워밍업 시퀀스 (아이디 예열)

신규 계정/디바이스의 자연스러운 시청 패턴을 만들기 위한 워밍업 기능.

### 수정 4: 워밍업용 YT 상수 추가

기존 YT 객체에 추가:
```javascript
HOME_FEED:         { resourceId: 'com.google.android.youtube:id/results' },
RELATED_VIDEO:     { resourceId: 'com.google.android.youtube:id/thumbnail' },
AUTOPLAY_TOGGLE:   { resourceId: 'com.google.android.youtube:id/autonav_toggle' },
BOTTOM_NAV_HOME:   { contentDesc: '홈' },
BOTTOM_NAV_SHORTS: { contentDesc: 'Shorts' },
BOTTOM_NAV_SUBS:   { contentDesc: '구독' },
```

### 수정 5: _doWarmup 메서드 추가

```javascript
/**
 * 디바이스 워밍업 — 자연스러운 탐색 패턴 생성
 * 메인 시청 작업 전에 실행하여 계정을 예열
 * 
 * 워밍업 플로우:
 * 1. YouTube 홈 → 스크롤 → 랜덤 영상 시청 (30~90초)
 * 2. 연관 영상 1~2개 탐색
 * 3. 홈으로 복귀
 * 
 * @param {string} serial - 디바이스 시리얼
 * @param {number} [durationSec=120] - 워밍업 총 시간 (초)
 * @returns {Promise<void>}
 */
async _doWarmup(serial, durationSec = 120) {
    try {
        console.log(`[Warmup] 🔥 ${serial.substring(0, 6)} starting warmup (${durationSec}s)`);
        const screen = await this._getScreenSize(serial);
        const midX = Math.round(screen.width / 2);

        // 1. YouTube 앱 실행 (홈)
        await this.xiaowei.adbShell(serial, 'am force-stop com.google.android.youtube');
        await _sleep(1000);
        await this.xiaowei.adbShell(serial, 'monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1');
        await _sleep(_randInt(3000, 5000));

        // 2. 홈 버튼 터치 (혹시 다른 탭이면)
        await this._findAndTap(serial, YT.BOTTOM_NAV_HOME, 0);
        await _sleep(_randInt(1500, 2500));

        // 3. 홈 피드 스크롤 (2~4회)
        const scrollCount = _randInt(2, 4);
        for (let i = 0; i < scrollCount; i++) {
            await this.xiaowei.adbShell(serial,
                `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
            );
            await _sleep(_randInt(1500, 3000));
        }

        const startTime = Date.now();
        const targetMs = durationSec * 1000;
        let videosWatched = 0;

        // 4. 랜덤 영상 시청 루프
        while ((Date.now() - startTime) < targetMs && videosWatched < 3) {
            // 화면 중앙~하단의 영상 썸네일 터치
            const tapY = Math.round(screen.height * (_randInt(35, 65) / 100));
            await this.xiaowei.adbShell(serial, `input tap ${midX} ${tapY}`);
            await _sleep(_randInt(3000, 5000));

            // 광고 건너뛰기
            await this._trySkipAd(serial);
            await _sleep(1000);
            await this._ensurePlaying(serial);

            // 30~90초 시청
            const watchTime = _randInt(30, 90) * 1000;
            const remaining = targetMs - (Date.now() - startTime);
            const actualWatch = Math.min(watchTime, remaining);

            if (actualWatch <= 0) break;

            // 미니 시청 루프
            let watched = 0;
            while (watched < actualWatch) {
                await _sleep(5000);
                watched += 5000;
                if (watched % 15000 < 5000) await this._trySkipAd(serial);
                if (watched % 30000 < 5000) await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_WAKEUP');
            }

            videosWatched++;
            console.log(`[Warmup] ${serial.substring(0, 6)} watched video #${videosWatched} (${Math.round(actualWatch / 1000)}s)`);

            // 50% 확률로 연관 영상 이동, 50% 확률로 뒤로가기
            if (Math.random() < 0.5 && (Date.now() - startTime) < targetMs) {
                // 연관 영상 터치 (영상 아래 추천 영역)
                await this.xiaowei.adbShell(serial,
                    `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
                );
                await _sleep(_randInt(1000, 2000));
                await this._findAndTap(serial, YT.RELATED_VIDEO, 0);
                await _sleep(_randInt(3000, 5000));
            } else {
                // 뒤로가기 (홈으로)
                await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_BACK');
                await _sleep(_randInt(1500, 2500));

                // 한번 더 스크롤
                await this.xiaowei.adbShell(serial,
                    `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(500, 900)}`
                );
                await _sleep(_randInt(1500, 2500));
            }
        }

        // 5. 홈으로
        await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_HOME');
        await _sleep(500);

        console.log(`[Warmup] ✓ ${serial.substring(0, 6)} warmup done (${videosWatched} videos, ${Math.round((Date.now() - startTime) / 1000)}s)`);
    } catch (err) {
        console.error(`[Warmup] ✗ ${serial.substring(0, 6)} warmup error: ${err.message}`);
        try { await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_HOME'); } catch {}
    }
}
```

### 수정 6: _watchVideoOnDevice에 워밍업 옵션 추가

engagementConfig에 `warmup` 필드 추가:

```javascript
async _watchVideoOnDevice(serial, videoUrl, durationSec, searchKeyword, videoTitle, engagementConfig) {
    const eng = engagementConfig || {};

    // 워밍업 (지정된 경우)
    if (eng.warmupSec && eng.warmupSec > 0) {
        await this._doWarmup(serial, eng.warmupSec);
    }

    // ... 이후 기존 코드 (Phase 1, 2에서 구현된 것) ...
}
```

### 수정 7: 워밍업 트리거 조건 (_executeJobAssignment)

```javascript
    // 워밍업 조건: 디바이스의 첫 assignment이거나 설정에서 활성화된 경우
    const warmupSec = this._shouldWarmup(serial) ? _randInt(60, 180) : 0;

    const engagementConfig = {
        // ... 기존 필드 ...
        warmupSec: warmupSec,
    };
```

```javascript
/**
 * 디바이스가 워밍업이 필요한지 판단
 * 최근 1시간 내 작업 이력이 없으면 워밍업 실행
 */
_shouldWarmup(serial) {
    const key = `lastTask_${serial}`;
    const lastTask = this._warmupTracker && this._warmupTracker.get(key);
    const now = Date.now();

    if (!this._warmupTracker) {
        this._warmupTracker = new Map();
    }

    this._warmupTracker.set(key, now);

    // 첫 작업이거나 1시간 이상 쉬었으면 워밍업
    if (!lastTask || (now - lastTask) > 3600000) {
        return true;
    }
    return false;
}
```

---

## Part C: 통계 확장

### 수정 8: job_assignments completed 업데이트 최종본

Phase 1~3 통합된 최종 업데이트:

```javascript
    await this.supabaseSync.supabase
        .from("job_assignments")
        .update({
            status: "completed",
            progress_pct: 100,
            completed_at: new Date().toISOString(),
            ...(result.actualDurationSec != null && { final_duration_sec: result.actualDurationSec }),
            ...(result.watchPercentage != null && { watch_percentage: result.watchPercentage }),
            did_like: result.liked || false,
            did_comment: result.commented || false,
            did_playlist: result.playlisted || false,
            // did_subscribe는 컬럼 추가 후 활성화:
            // did_subscribe: result.subscribed || false,
            // comment_text: result.commentText || null,
        })
        .eq("id", assignment.id);
```

---

## 수정하지 말 것
- `_findAndTap`, `_hasElement`, `_getScreenSize` — 그대로
- `_trySkipAd`, `_ensurePlaying` — 그대로
- `_searchAndSelectVideo`, `_buildSearchQuery`, `_inputText` — 그대로
- `_doLike`, `_doSubscribe`, `_doComment` — 그대로
- `_getPersonality`, `_calcProb` — 그대로
- `CommentGenerator (comment-generator.js)` — 그대로
- `_pollJobAssignments` — 변경 없음
- `_extractShellOutput` — 변경 없음

## 테스트 방법

### 재생목록 테스트
1. 영상의 `prob_playlist` 값을 100으로 설정 (Supabase에서)
2. Agent 실행
3. 로그: `[Engagement] 📋 XXXXXX saved to Watch Later`
4. Supabase: `job_assignments.did_playlist = true`

### 워밍업 테스트
1. Agent 재시작 (모든 디바이스가 첫 작업이므로 워밍업 트리거)
2. 로그:
   - `[Warmup] 🔥 XXXXXX starting warmup (120s)`
   - `[Warmup] XXXXXX watched video #1 (45s)`
   - `[Warmup] ✓ XXXXXX warmup done (2 videos, 118s)`
3. 워밍업 완료 후 정상 시청 작업 시작
4. 1시간 내 재실행 시 워밍업 스킵

## DB 마이그레이션 (선택)

```sql
-- 재생목록 확률 컬럼 (videos에 없으면)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS prob_playlist integer DEFAULT 3;

-- 구독 결과 기록 (job_assignments에 없으면)
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS did_subscribe boolean DEFAULT false;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS comment_text text;
```
