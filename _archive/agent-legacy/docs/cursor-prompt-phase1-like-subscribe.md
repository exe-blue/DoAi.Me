# Phase 1: 좋아요/구독 + 확률 시스템 구현

## 수정 파일
`agent/task-executor.js`

## 참조 문서
- `@docs/engagement-system-design.md` — 전체 설계서
- `@docs/youtube-ui-objects.md` — UI 오브젝트 레퍼런스

## 변경 1: 상수 추가 (파일 상단, YT 상수 아래)

```javascript
// === Engagement 상수 ===

const PERSONALITY_TYPES = {
    passive:   { likeMult: 0.3, commentMult: 0.0, subscribeMult: 0.2, playlistMult: 0.1 },
    casual:    { likeMult: 0.7, commentMult: 0.3, subscribeMult: 0.5, playlistMult: 0.3 },
    active:    { likeMult: 1.5, commentMult: 1.0, subscribeMult: 1.2, playlistMult: 1.0 },
    superfan:  { likeMult: 2.0, commentMult: 2.0, subscribeMult: 2.0, playlistMult: 2.0 },
};

// 성격 분포 (가중 랜덤용)
const PERSONALITY_DISTRIBUTION = [
    { type: 'passive',  weight: 30 },
    { type: 'casual',   weight: 40 },
    { type: 'active',   weight: 20 },
    { type: 'superfan', weight: 10 },
];

// 시간대별 참여 가중치 (0~23시)
const TIME_WEIGHT = {
    0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.2, 5: 0.3,
    6: 0.5, 7: 0.7, 8: 0.8,
    9: 0.9, 10: 1.0, 11: 1.0, 12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 1.0,
    17: 1.1, 18: 1.2, 19: 1.3, 20: 1.3, 21: 1.2,
    22: 1.0, 23: 0.7,
};

// 기본 확률값
const DEFAULT_PROBS = {
    like: 15,
    comment: 5,
    subscribe: 8,
    playlist: 3,
};

// Engagement용 YouTube UI 요소 (YT 상수에 추가)
// 기존 YT 객체에 아래 항목 추가:
// YT.LIKE_BUTTON = { resourceId: 'com.google.android.youtube:id/like_button' };
// YT.SUBSCRIBE_BUTTON = { resourceId: 'com.google.android.youtube:id/subscribe_button' };
// YT.SUBSCRIBE_ALT = { textContains: '구독 중' };
```

기존 YT 상수 객체에 아래를 추가:
```javascript
LIKE_BUTTON:      { resourceId: 'com.google.android.youtube:id/like_button' },
SUBSCRIBE_BUTTON: { resourceId: 'com.google.android.youtube:id/subscribe_button' },
SUBSCRIBE_TEXT:   { textContains: '구독 중' },
```

## 변경 2: TaskExecutor 클래스에 성격 맵 추가

```javascript
constructor(xiaowei, supabaseSync, config) {
    // ... 기존 코드 유지 ...
    
    // 디바이스별 성격 캐시 (serial → personality type)
    this._devicePersonalities = new Map();
}
```

## 변경 3: 성격 결정 메서드 추가

```javascript
/**
 * 디바이스별 고정 성격 반환 (최초 결정 후 캐싱)
 * @param {string} serial
 * @returns {object} { likeMult, commentMult, subscribeMult, playlistMult }
 */
_getPersonality(serial) {
    if (this._devicePersonalities.has(serial)) {
        return this._devicePersonalities.get(serial);
    }

    // 가중 랜덤으로 성격 결정
    const roll = Math.random() * 100;
    let cumulative = 0;
    let selectedType = 'casual';

    for (const entry of PERSONALITY_DISTRIBUTION) {
        cumulative += entry.weight;
        if (roll < cumulative) {
            selectedType = entry.type;
            break;
        }
    }

    const personality = PERSONALITY_TYPES[selectedType];
    this._devicePersonalities.set(serial, { ...personality, type: selectedType });
    console.log(`[Engagement] ${serial.substring(0, 6)} personality: ${selectedType}`);
    return this._devicePersonalities.get(serial);
}

/**
 * 최종 확률 계산
 * @param {number} baseProb - 기본 확률 (0~100)
 * @param {number} personalityMult - 성격 배율
 * @returns {number} 0~1 사이 확률
 */
_calcProb(baseProb, personalityMult) {
    const timeWeight = TIME_WEIGHT[new Date().getHours()] || 1.0;
    return Math.min(1.0, (baseProb / 100) * personalityMult * timeWeight);
}
```

## 변경 4: _doLike 메서드 추가

```javascript
/**
 * 좋아요 실행
 * @param {string} serial
 * @returns {Promise<boolean>} 성공 여부
 */
async _doLike(serial) {
    try {
        // 1. 약간 아래로 스크롤 (좋아요 버튼 영역 노출)
        const screen = await this._getScreenSize(serial);
        const midX = Math.round(screen.width / 2);
        const fromY = Math.round(screen.height * 0.6);
        const toY = Math.round(screen.height * 0.4);
        await this.xiaowei.adbShell(serial, `input swipe ${midX} ${fromY} ${midX} ${toY} ${_randInt(300, 600)}`);
        await _sleep(_randInt(800, 1500));

        // 2. 좋아요 버튼 터치
        const tapped = await this._findAndTap(serial, YT.LIKE_BUTTON, 1);
        if (!tapped) {
            console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} like button not found`);
            return false;
        }

        await _sleep(_randInt(500, 1000));
        console.log(`[Engagement] 👍 ${serial.substring(0, 6)} liked`);

        // 3. 다시 위로 스크롤 (영상 보기 복귀)
        await this.xiaowei.adbShell(serial, `input swipe ${midX} ${toY} ${midX} ${fromY} ${_randInt(300, 600)}`);
        await _sleep(_randInt(500, 1000));

        return true;
    } catch (err) {
        console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} like failed: ${err.message}`);
        return false;
    }
}
```

## 변경 5: _doSubscribe 메서드 추가

```javascript
/**
 * 구독 실행
 * @param {string} serial
 * @returns {Promise<boolean>} 성공 여부
 */
async _doSubscribe(serial) {
    try {
        // 1. 이미 구독 중인지 확인
        const alreadySubscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
        if (alreadySubscribed) {
            console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} already subscribed, skip`);
            return false;
        }

        // 2. 구독 버튼 터치
        const tapped = await this._findAndTap(serial, YT.SUBSCRIBE_BUTTON, 1);
        if (!tapped) {
            // content-desc 폴백
            const altTapped = await this._findAndTap(serial, { contentDesc: '구독' }, 1);
            if (!altTapped) {
                console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} subscribe button not found`);
                return false;
            }
        }

        await _sleep(_randInt(1000, 2000));

        // 3. 구독 확인
        const subscribed = await this._hasElement(serial, YT.SUBSCRIBE_TEXT);
        if (subscribed) {
            console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribed!`);
            return true;
        }

        // 확인 안 돼도 터치했으면 성공으로 간주
        console.log(`[Engagement] 🔔 ${serial.substring(0, 6)} subscribe tapped (unconfirmed)`);
        return true;
    } catch (err) {
        console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} subscribe failed: ${err.message}`);
        return false;
    }
}
```

## 변경 6: _watchVideoOnDevice 시청 루프에 Engagement 통합

기존 `_watchVideoOnDevice` 메서드를 수정.
파라미터 추가: `engagementConfig` (6번째 인자)

```javascript
// 메서드 시그니처 변경
async _watchVideoOnDevice(serial, videoUrl, durationSec, searchKeyword, videoTitle, engagementConfig) {
    // engagementConfig = { probLike, probComment, probSubscribe, probPlaylist, channelName, videoId }
    // null/undefined면 engagement 비활성화
    
    const eng = engagementConfig || {};
    const personality = this._getPersonality(serial);
    
    // 확률 계산 + 사전 판정
    const willLike = Math.random() < this._calcProb(eng.probLike || DEFAULT_PROBS.like, personality.likeMult);
    const willSubscribe = Math.random() < this._calcProb(eng.probSubscribe || DEFAULT_PROBS.subscribe, personality.subscribeMult);
    // Phase 2에서 추가: willComment
    // Phase 3에서 추가: willPlaylist
    
    // 액션 실행 시점 (자연스러운 랜덤)
    const likeAtSec = durationSec * (_randInt(20, 40) / 100);
    const subscribeAtSec = durationSec * (_randInt(60, 80) / 100);
    
    const actions = { liked: false, subscribed: false, commented: false, playlisted: false };
    
    if (willLike || willSubscribe) {
        console.log(`[Engagement] ${serial.substring(0, 6)} [${personality.type}] plan: like=${willLike}@${Math.round(likeAtSec)}s sub=${willSubscribe}@${Math.round(subscribeAtSec)}s`);
    }
    
    // ... 기존 코드: 화면 깨우기, 세로 고정, YouTube 실행, 검색 ...
    
    // === 시청 루프 (기존 루프를 아래로 교체) ===
    const targetMs = durationSec * 1000;
    let elapsed = 0;
    const TICK_MS = 5000;
    
    while (elapsed < targetMs) {
        const waitMs = Math.min(TICK_MS, targetMs - elapsed);
        await _sleep(waitMs);
        elapsed += waitMs;
        const elapsedSec = elapsed / 1000;
        
        // 광고 체크 (15초마다)
        if (elapsed % 15000 < TICK_MS) {
            await this._trySkipAd(serial);
        }
        
        // 화면 깨우기 (30초마다)
        if (elapsed % 30000 < TICK_MS) {
            await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_WAKEUP');
        }
        
        // 좋아요 (시점 도달 시)
        if (willLike && !actions.liked && elapsedSec >= likeAtSec) {
            actions.liked = await this._doLike(serial);
        }
        
        // 구독 (시점 도달 시)
        if (willSubscribe && !actions.subscribed && elapsedSec >= subscribeAtSec) {
            actions.subscribed = await this._doSubscribe(serial);
        }
        
        // Phase 2: 댓글
        // Phase 3: 재생목록
    }
    
    // ... 기존 코드: 홈으로, return ...
    
    // return에 actions 추가
    return {
        actualDurationSec: ...,
        watchPercentage: ...,
        ...actions,
    };
}
```

## 변경 7: _executeJobAssignment에서 engagementConfig 전달

```javascript
async _executeJobAssignment(assignment) {
    // ... 기존 코드 ...
    
    // job SELECT에 확률 필드 추가
    const { data: job, error: jobErr } = await this.supabaseSync.supabase
        .from("jobs")
        .select("target_url, duration_sec, duration_min_pct, duration_max_pct, keyword, video_title, title, prob_like, prob_comment, prob_playlist")
        .eq("id", assignment.job_id)
        .single();
    
    // ... 기존 duration 계산 코드 ...
    
    // engagementConfig 구성
    const engagementConfig = {
        probLike: job.prob_like || DEFAULT_PROBS.like,
        probComment: job.prob_comment || DEFAULT_PROBS.comment,
        probSubscribe: DEFAULT_PROBS.subscribe,  // jobs에 없으면 기본값
        probPlaylist: job.prob_playlist || DEFAULT_PROBS.playlist,
        channelName: '',  // Phase 2에서 추가
        videoId: '',      // Phase 2에서 추가
    };
    
    const result = await this._watchVideoOnDevice(
        serial, job.target_url, watchDurationSec, searchKeyword, videoTitle, engagementConfig
    );
    
    // completed 업데이트에 actions 추가
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
        })
        .eq("id", assignment.id);
}
```

## 수정하지 말 것
- `_findAndTap`, `_hasElement`, `_getScreenSize` — 이미 구현됨, 그대로 사용
- `_trySkipAd`, `_ensurePlaying` — 그대로 유지
- `_searchAndSelectVideo`, `_buildSearchQuery`, `_inputText` — 그대로 유지
- `_pollJobAssignments` — 변경 없음
- `_extractShellOutput` — 변경 없음

## 테스트 방법
1. Agent 실행
2. 로그에서 확인:
   - `[Engagement] XXXXXX personality: casual` — 성격 결정
   - `[Engagement] XXXXXX [casual] plan: like=true@45s sub=false` — 액션 계획
   - `[Engagement] 👍 XXXXXX liked` — 좋아요 성공
   - `[Engagement] 🔔 XXXXXX subscribed!` — 구독 성공
3. Supabase에서 `job_assignments.did_like = true` 확인
