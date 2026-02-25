# Phase 2: 댓글 시스템 (ChatGPT API + 한글 입력)

## 전제조건
- Phase 1 (좋아요/구독 + 확률 시스템) 완료 상태
- `_doLike`, `_doSubscribe`, `_getPersonality`, `_calcProb` 등 이미 존재

## 수정 파일
- `agent/task-executor.js` — 주 수정
- `agent/comment-generator.js` — 신규 파일 생성

## 참조 문서
- `@docs/engagement-system-design.md` — 전체 설계서 (섹션 5: ChatGPT 댓글 생성)
- `@docs/youtube-ui-objects.md` — 댓글 관련 UI 오브젝트

---

## 신규 파일: agent/comment-generator.js

```javascript
/**
 * ChatGPT API를 이용한 YouTube 댓글 자동 생성기
 * 
 * 사용법:
 *   const gen = new CommentGenerator(process.env.OPENAI_API_KEY);
 *   const comment = await gen.generate("영상 제목", "채널명", "videoId");
 */

const COMMENT_SYSTEM_PROMPT = `당신은 YouTube 영상을 보고 댓글을 다는 일반 한국인 시청자입니다.

규칙:
- 10~50자 사이의 짧고 자연스러운 댓글 하나만 작성하세요
- 이모지를 가끔 사용하세요 (30% 확률 정도)
- 존댓말과 반말을 자연스럽게 섞으세요
- 광고성이나 스팸처럼 보이면 절대 안 됩니다
- 구체적 내용보다 감정/반응/공감 위주로 작성하세요
- 가끔 질문 형태도 좋습니다
- "좋아요", "구독", "알림", "추천" 같은 단어는 절대 사용 금지
- "저는 AI", "도움이 되셨", "감사합니다!" 같은 AI 투 금지
- 댓글만 출력하세요. 따옴표나 설명 없이 댓글 텍스트만.

스타일 예시:
- 오 이거 진짜 도움 됐어요
- 와 대박... 이런 정보 어디서 알아오시는 거예요
- 매일 듣고 있어요 ㅎㅎ
- 이 부분 진짜 공감됨 ㅋㅋ
- 혹시 다음편은 언제 올라오나요??
- 3:25 여기 부분 미쳤다 진짜
- 아 이거 찾고 있었는데 ㅠㅠ
- 브금 뭔지 알 수 있을까요?
- 퇴근하고 매일 보는 중`;

const SPAM_KEYWORDS = ['구독', '좋아요', '알림', '홍보', '광고', 'http', 'www', '링크', '무료', '이벤트', '추천인'];
const AI_KEYWORDS = ['저는 AI', '언어 모델', '도움이 되셨', '감사합니다!', '도움이 되었', '유익한 콘텐츠'];

class CommentGenerator {
    constructor(apiKey, model) {
        this.apiKey = apiKey;
        this.model = model || 'gpt-4o-mini';
        this.recentComments = [];  // 최근 100개 (중복 방지)
    }

    /**
     * 댓글 생성
     * @param {string} videoTitle - 영상 제목
     * @param {string} channelName - 채널명
     * @param {string} videoId - 영상 ID (로깅용)
     * @returns {Promise<string|null>} 생성된 댓글 또는 null
     */
    async generate(videoTitle, channelName, videoId) {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const comment = await this._callAPI(videoTitle, channelName);

                // 품질 검증
                if (!this._isValid(comment)) {
                    console.warn(`[CommentGen] Invalid comment (attempt ${attempt + 1}): "${comment}"`);
                    continue;
                }

                // 중복 검사
                if (this.recentComments.includes(comment)) {
                    console.warn(`[CommentGen] Duplicate comment (attempt ${attempt + 1})`);
                    continue;
                }

                // 성공 — 캐시에 추가
                this.recentComments.push(comment);
                if (this.recentComments.length > 100) this.recentComments.shift();

                console.log(`[CommentGen] ✓ Generated for "${videoTitle.substring(0, 30)}": "${comment}"`);
                return comment;

            } catch (err) {
                console.error(`[CommentGen] API error (attempt ${attempt + 1}): ${err.message}`);
                if (attempt === 2) return null;
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        return null;
    }

    async _callAPI(videoTitle, channelName) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: this.model,
                messages: [
                    { role: 'system', content: COMMENT_SYSTEM_PROMPT },
                    { role: 'user', content: `영상 제목: "${videoTitle}"\n채널명: "${channelName}"\n\n댓글:` },
                ],
                max_tokens: 100,
                temperature: 1.1,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        let text = data.choices[0].message.content.trim();

        // 따옴표 제거 (AI가 가끔 감싸는 경우)
        text = text.replace(/^["'"""]|["'"""]$/g, '');

        return text;
    }

    _isValid(comment) {
        if (!comment || comment.length < 5 || comment.length > 100) return false;
        if (SPAM_KEYWORDS.some(s => comment.includes(s))) return false;
        if (AI_KEYWORDS.some(s => comment.includes(s))) return false;
        return true;
    }
}

module.exports = CommentGenerator;
```

이 파일을 `agent/comment-generator.js`로 생성해줘.

---

## task-executor.js 수정

### 수정 1: 파일 상단에 require 추가

```javascript
const CommentGenerator = require('./comment-generator');
```

### 수정 2: YT 상수에 댓글 관련 요소 추가

기존 YT 객체에 추가:
```javascript
COMMENT_INPUT:    { resourceId: 'com.google.android.youtube:id/comment_composer_input' },
COMMENT_INPUT_ALT:{ contentDesc: '댓글 추가...' },
COMMENT_POST:     { resourceId: 'com.google.android.youtube:id/comment_post_button' },
COMMENT_POST_ALT: { contentDesc: '댓글' },
```

### 수정 3: constructor에 CommentGenerator 초기화

```javascript
constructor(xiaowei, supabaseSync, config) {
    // ... 기존 코드 유지 ...
    // ... this._devicePersonalities = new Map(); (Phase 1에서 추가됨) ...

    // 댓글 생성기 초기화
    this.commentGenerator = null;
    if (process.env.OPENAI_API_KEY) {
        this.commentGenerator = new CommentGenerator(
            process.env.OPENAI_API_KEY,
            process.env.OPENAI_MODEL || 'gpt-4o-mini'
        );
        console.log('[TaskExecutor] ✓ CommentGenerator initialized (OpenAI)');
    } else {
        console.log('[TaskExecutor] ⚠ OPENAI_API_KEY not set — comments disabled');
    }
}
```

### 수정 4: _doComment 메서드 추가

```javascript
/**
 * 댓글 작성 실행
 * @param {string} serial - 디바이스 시리얼
 * @param {string} commentText - 작성할 댓글 텍스트
 * @returns {Promise<boolean>} 성공 여부
 */
async _doComment(serial, commentText) {
    try {
        const screen = await this._getScreenSize(serial);
        const midX = Math.round(screen.width / 2);

        // 1. 댓글 영역까지 스크롤 (아래로 충분히)
        for (let i = 0; i < 3; i++) {
            await this.xiaowei.adbShell(serial,
                `input swipe ${midX} ${Math.round(screen.height * 0.7)} ${midX} ${Math.round(screen.height * 0.3)} ${_randInt(400, 700)}`
            );
            await _sleep(_randInt(600, 1000));
        }
        await _sleep(_randInt(1000, 1500));

        // 2. 댓글 입력창 찾기 + 터치
        let found = await this._findAndTap(serial, YT.COMMENT_INPUT, 2);
        if (!found) {
            found = await this._findAndTap(serial, YT.COMMENT_INPUT_ALT, 1);
        }
        if (!found) {
            console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment input not found`);
            // 스크롤 복귀
            await this._scrollBackToVideo(serial, screen);
            return false;
        }
        await _sleep(_randInt(1000, 2000));

        // 3. 댓글 텍스트 입력 (한글 지원)
        await this._inputText(serial, commentText);
        await _sleep(_randInt(1000, 2500)); // 타이핑 시뮬레이션 대기

        // 4. 댓글 등록 버튼 터치
        let posted = await this._findAndTap(serial, YT.COMMENT_POST, 2);
        if (!posted) {
            posted = await this._findAndTap(serial, YT.COMMENT_POST_ALT, 1);
        }
        if (!posted) {
            // 버튼 못 찾으면 취소
            console.warn(`[Engagement] ⚠ ${serial.substring(0, 6)} comment post button not found`);
            await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_BACK');
            await _sleep(500);
            await this._scrollBackToVideo(serial, screen);
            return false;
        }

        await _sleep(_randInt(2000, 3000)); // 등록 대기
        console.log(`[Engagement] 💬 ${serial.substring(0, 6)} commented: "${commentText.substring(0, 30)}..."`);

        // 5. 영상으로 스크롤 복귀
        await this._scrollBackToVideo(serial, screen);

        return true;
    } catch (err) {
        console.warn(`[Engagement] ✗ ${serial.substring(0, 6)} comment failed: ${err.message}`);
        // 안전하게 뒤로가기 시도
        try { await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_BACK'); } catch {}
        return false;
    }
}

/**
 * 영상 플레이어 위치로 스크롤 복귀
 */
async _scrollBackToVideo(serial, screen) {
    const midX = Math.round(screen.width / 2);
    for (let i = 0; i < 3; i++) {
        await this.xiaowei.adbShell(serial,
            `input swipe ${midX} ${Math.round(screen.height * 0.3)} ${midX} ${Math.round(screen.height * 0.7)} ${_randInt(400, 700)}`
        );
        await _sleep(_randInt(400, 700));
    }
    await _sleep(_randInt(500, 1000));
}
```

### 수정 5: _watchVideoOnDevice 시청 루프에 댓글 통합

기존 Phase 1에서 `// Phase 2: 댓글` 주석이 있는 부분을 수정.

`willLike`, `willSubscribe` 판정 블록 아래에 추가:
```javascript
    // 댓글 판정 + 사전 생성
    const willComment = this.commentGenerator
        ? Math.random() < this._calcProb(eng.probComment || DEFAULT_PROBS.comment, personality.commentMult)
        : false;
    const commentAtSec = durationSec * (_randInt(40, 65) / 100);

    let commentText = null;
    if (willComment) {
        // 시청 시작 전에 댓글 미리 생성 (API 대기 시간 절약)
        commentText = await this.commentGenerator.generate(
            videoTitle || '영상',
            eng.channelName || '',
            eng.videoId || ''
        );
        if (!commentText) {
            // 생성 실패 시 댓글 취소
            console.warn(`[Engagement] ${serial.substring(0, 6)} comment generation failed, skip`);
        }
    }
```

로그 출력 부분 수정:
```javascript
    if (willLike || willComment || willSubscribe) {
        console.log(`[Engagement] ${serial.substring(0, 6)} [${personality.type}] plan: ` +
            `like=${willLike}@${Math.round(likeAtSec)}s ` +
            `comment=${willComment && !!commentText}@${Math.round(commentAtSec)}s ` +
            `sub=${willSubscribe}@${Math.round(subscribeAtSec)}s`);
    }
```

시청 루프 내에서 `// Phase 2: 댓글` 주석을 아래로 교체:
```javascript
        // 댓글 (시점 도달 시)
        if (willComment && commentText && !actions.commented && elapsedSec >= commentAtSec) {
            actions.commented = await this._doComment(serial, commentText);
        }
```

return에 commentText 추가:
```javascript
    return {
        actualDurationSec: ...,
        watchPercentage: ...,
        ...actions,
        commentText: actions.commented ? commentText : null,
    };
```

### 수정 6: _executeJobAssignment에서 channelName, videoId 전달

job SELECT에 추가 (이미 없는 경우):
```javascript
    // video 정보도 가져오기 (channelName, videoId 용)
    // target_url에서 videoId 추출
    let videoId = '';
    try {
        const u = new URL(job.target_url);
        videoId = u.searchParams.get('v') || '';
    } catch {}

    const engagementConfig = {
        probLike: job.prob_like || DEFAULT_PROBS.like,
        probComment: job.prob_comment || DEFAULT_PROBS.comment,
        probSubscribe: DEFAULT_PROBS.subscribe,
        probPlaylist: job.prob_playlist || DEFAULT_PROBS.playlist,
        channelName: job.video_title ? '' : '',  // jobs에 채널명 없으면 빈 문자열
        videoId: videoId,
    };
```

---

## .env 추가

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

## 테스트 방법

1. `.env`에 `OPENAI_API_KEY` 설정
2. Agent 실행 → `[TaskExecutor] ✓ CommentGenerator initialized` 확인
3. 로그에서:
   - `[CommentGen] ✓ Generated for "영상제목": "댓글내용"`
   - `[Engagement] ... plan: ... comment=true@120s ...`
   - `[Engagement] 💬 XXXXXX commented: "댓글내용..."`
4. 실패 시: `⚠ comment input not found` → 댓글 영역 스크롤 부족, 스크롤 횟수 조정

## 수정하지 말 것
- `_findAndTap`, `_hasElement`, `_getScreenSize` — 그대로
- `_trySkipAd`, `_ensurePlaying` — 그대로
- `_searchAndSelectVideo`, `_buildSearchQuery` — 그대로
- `_doLike`, `_doSubscribe` — Phase 1에서 구현된 것 그대로
- `_getPersonality`, `_calcProb` — 그대로
- `_pollJobAssignments` — 변경 없음
