# YouTube Engagement Action System — 프로세스 설계서

## 1. 개요

영상 시청 중 실제 유저처럼 좋아요, 댓글, 구독 등의 참여 행동을 확률적으로 수행.
댓글은 ChatGPT API로 영상 제목/맥락에 맞는 자연스러운 댓글을 실시간 생성.

## 2. 전체 플로우

```
영상 시청 시작
    │
    ├── [시청 30% 시점] ── 좋아요 판정 (prob_like%)
    │                        └── _findAndTap → like_button → selected 확인
    │
    ├── [시청 50% 시점] ── 댓글 판정 (prob_comment%)
    │                        ├── ChatGPT API → 댓글 생성
    │                        ├── 댓글 입력창 스크롤 → 터치
    │                        ├── _inputText → 댓글 입력
    │                        └── 댓글 등록 버튼 터치
    │
    ├── [시청 70% 시점] ── 구독 판정 (prob_subscribe%)
    │                        └── _findAndTap → subscribe_button → "구독 중" 확인
    │
    ├── [시청 중 매 15초] ── 광고 건너뛰기
    ├── [시청 중 매 30초] ── 화면 깨우기
    │
    └── [시청 완료] ── 홈으로
```

## 3. 확률 시스템 설계

### 3.1 확률 소스 (우선순위)

```
1순위: job_assignments에 개별 설정된 값
2순위: jobs 테이블의 값
3순위: videos 테이블의 기본값
4순위: 시스템 기본값 (아래)
```

### 3.2 기본 확률값 (시스템 기본)

| 액션 | 기본 확률 | 범위 | 설명 |
| --- | --- | --- | --- |
| 좋아요 | 15% | 0~100 | 실제 YouTube 좋아요 비율 ~4% 대비 높지만, 신규 채널 부스트 목적 |
| 댓글 | 5% | 0~100 | 실제 댓글 비율 ~0.5% 대비 높음, 자연스러움 유지 |
| 구독 | 8% | 0~100 | 채널 성장 핵심 지표 |
| 재생목록 저장 | 3% | 0~100 | 알고리즘에 긍정 시그널 |

### 3.3 확률 조정 팩터

자연스러운 패턴을 위해 디바이스별 개성 부여:

```javascript
// 디바이스별 성격 (최초 assignment 시 결정, 고정)
const PERSONALITY_TYPES = {
    passive:    { likeMult: 0.3, commentMult: 0.0, subscribeMult: 0.2 },  // 30% - 조용한 시청자
    casual:     { likeMult: 0.7, commentMult: 0.3, subscribeMult: 0.5 },  // 40% - 일반 시청자
    active:     { likeMult: 1.5, commentMult: 1.0, subscribeMult: 1.2 },  // 20% - 적극적 시청자
    superfan:   { likeMult: 2.0, commentMult: 2.0, subscribeMult: 2.0 },  // 10% - 열성 팬
};

// 실제 확률 = 기본 확률 × 성격 배율
// 예: active 유저, prob_like=15% → 15% × 1.5 = 22.5%
// 예: passive 유저, prob_comment=5% → 5% × 0.0 = 0% (댓글 안 함)
```

### 3.4 시간대별 가중치

실제 유저 행동 패턴 반영:

```javascript
const TIME_WEIGHT = {
    // 새벽 (0-6시): 참여도 낮음
    0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.2, 5: 0.3,
    // 아침 (6-9시): 출근 시간, 보통
    6: 0.5, 7: 0.7, 8: 0.8,
    // 오전~오후 (9-17시): 보통~높음
    9: 0.9, 10: 1.0, 11: 1.0, 12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 1.0,
    // 저녁 (17-22시): 최고 참여도
    17: 1.1, 18: 1.2, 19: 1.3, 20: 1.3, 21: 1.2,
    // 밤 (22-24시): 감소
    22: 1.0, 23: 0.7,
};

// 최종 확률 = 기본 확률 × 성격 배율 × 시간대 가중치
```

## 4. 액션별 상세 프로세스

### 4.1 좋아요 (Like)

```
트리거: 시청 시간의 30% ± 10% 도달 시
판정: Math.random() < finalLikeProb

실행:
1. 영상 아래로 살짝 스크롤 (좋아요 버튼 영역 노출)
   → input swipe (화면 중앙에서 위로 200~400px)
   → _sleep(800~1500ms)
   
2. 좋아요 버튼 찾기 + 터치
   → _findAndTap(serial, { resourceId: 'com.google.android.youtube:id/like_button' })
   
3. 결과 확인
   → _hasElement(serial, { contentDesc: '좋아요 표시함' }) 또는 selected=true
   
4. 로그
   → [Engagement] ✓ {serial} liked (prob: 22.5%)
```

### 4.2 댓글 (Comment)

```
트리거: 시청 시간의 50% ± 15% 도달 시
판정: Math.random() < finalCommentProb

실행:
1. ChatGPT API로 댓글 생성
   → POST /v1/chat/completions
   → 입력: 영상 제목, 채널명
   → 출력: 자연스러운 한국어 댓글 (10~50자)
   → _sleep(500ms) (생각하는 시간 시뮬레이션)

2. 댓글 영역으로 스크롤
   → input swipe (위로 충분히 스크롤)
   → _sleep(1000~2000ms)

3. 댓글 입력창 터치
   → _findAndTap(serial, { resourceId: 'com.google.android.youtube:id/comment_composer_input' })
   → 또는 _findAndTap(serial, { contentDesc: '댓글 추가...' })
   → _sleep(1000ms)

4. 댓글 텍스트 입력
   → _inputText(serial, commentText)
   → _sleep(500~1500ms) (타이핑 시뮬레이션)

5. 댓글 등록 버튼 터치
   → _findAndTap(serial, { resourceId: 'com.google.android.youtube:id/comment_post_button' })
   → _sleep(2000ms)

6. 결과 확인 + 로그
   → [Engagement] ✓ {serial} commented: "댓글내용..." (prob: 5%)

7. 다시 영상으로 스크롤 복귀
   → input swipe (아래로)
```

### 4.3 구독 (Subscribe)

```
트리거: 시청 시간의 70% ± 10% 도달 시
판정: Math.random() < finalSubscribeProb

실행:
1. 구독 버튼 찾기
   → _findAndTap(serial, { resourceId: 'com.google.android.youtube:id/subscribe_button' })

2. 이미 구독 중인지 확인
   → _hasElement(serial, { textContains: '구독 중' })
   → 이미 구독이면 스킵

3. 구독 후 확인
   → _hasElement(serial, { textContains: '구독 중' })

4. 알림 설정 (50% 확률로 기본 알림 유지, 50%는 변경 안 함)

5. 로그
   → [Engagement] ✓ {serial} subscribed (prob: 8%)
```

### 4.4 재생목록 저장 (Save to Playlist)

```
트리거: 시청 완료 직전 (90% 시점)
판정: Math.random() < finalPlaylistProb

실행:
1. 저장 버튼 찾기
   → _findAndTap(serial, { resourceId: 'com.google.android.youtube:id/save_to_playlist_button' })
   또는 _findAndTap(serial, { contentDesc: '재생목록에 저장' })

2. "나중에 볼 동영상" 선택 (기본 재생목록)
   → _findAndTap(serial, { textContains: '나중에 볼 동영상' })
   → _sleep(1000ms)

3. 로그
   → [Engagement] ✓ {serial} saved to playlist
```

## 5. ChatGPT 댓글 생성 시스템

### 5.1 API 연동

```javascript
// .env에 추가
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini   // 비용 효율적

// 또는 Claude API 사용 가능
// ANTHROPIC_API_KEY=sk-ant-...
```

### 5.2 프롬프트 설계

```javascript
const COMMENT_SYSTEM_PROMPT = `당신은 YouTube 영상을 보고 댓글을 다는 일반 한국인 시청자입니다.

규칙:
- 10~50자 사이의 짧고 자연스러운 댓글을 작성하세요
- 이모지를 가끔 사용하세요 (30% 확률)
- 존댓말과 반말을 섞어서 사용하세요 (영상 분위기에 따라)
- 광고성 댓글이나 스팸처럼 보이면 안 됩니다
- 구체적인 내용보다는 감정/반응 위주로 작성하세요
- 때로는 질문 형태도 좋습니다
- "좋아요", "구독" 같은 단어는 절대 사용하지 마세요

댓글 스타일 예시:
- "오 이거 진짜 도움 됐어요"
- "와 대박... 이런 정보 어디서 알아오시는 거예요"
- "매일 듣고 있어요 ㅎㅎ"
- "이 부분 진짜 공감됨 ㅋㅋ"
- "혹시 다음편은 언제 올라오나요??"
- "3:25 여기 부분 미쳤다 진짜"
`;

// 사용자 메시지
const userMessage = `
영상 제목: "${videoTitle}"
채널명: "${channelName}"

이 영상에 달 댓글 하나를 작성해주세요. 댓글만 출력하세요.
`;
```

### 5.3 댓글 캐싱 & 중복 방지

```javascript
class CommentGenerator {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.cache = new Map();       // videoId → [사용된 댓글들]
        this.recentComments = [];     // 최근 100개 댓글 (중복 방지)
    }

    async generate(videoTitle, channelName, videoId) {
        // 1. API 호출
        const comment = await this._callOpenAI(videoTitle, channelName);

        // 2. 중복 체크
        if (this.recentComments.includes(comment)) {
            // 재생성 (최대 3회)
            return this._callOpenAI(videoTitle, channelName);
        }

        // 3. 캐시에 추가
        this.recentComments.push(comment);
        if (this.recentComments.length > 100) this.recentComments.shift();

        return comment;
    }

    async _callOpenAI(videoTitle, channelName) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: COMMENT_SYSTEM_PROMPT },
                    { role: 'user', content: `영상 제목: "${videoTitle}"\n채널명: "${channelName}"\n\n댓글:` },
                ],
                max_tokens: 100,
                temperature: 1.1,  // 다양성 높이기
            }),
        });
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }
}
```

### 5.4 댓글 품질 필터

```javascript
function isValidComment(comment) {
    if (!comment || comment.length < 5 || comment.length > 100) return false;
    // 스팸 키워드 필터
    const spam = ['구독', '좋아요', '홍보', '광고', 'http', 'www', '링크'];
    if (spam.some(s => comment.includes(s))) return false;
    // AI 냄새 필터
    const aiSmell = ['저는 AI', '언어 모델', '도움이 되셨', '감사합니다!'];
    if (aiSmell.some(s => comment.includes(s))) return false;
    return true;
}
```

## 6. 데이터 모델 변경

### 6.1 job_assignments 테이블 — 액션 결과 기록 (이미 존재)

```
did_like: boolean (default false)
did_comment: boolean (default false)
did_playlist: boolean (default false)
```

### 6.2 videos 테이블 — 확률 설정 (이미 존재)

```
prob_like: integer (0~100, default 15)
prob_comment: integer (0~100, default 5)
prob_subscribe: integer (0~100, default 8)
```

### 6.3 추가 필요 컬럼 (선택)

```sql
-- videos 테이블에 추가 (선택)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS prob_playlist integer DEFAULT 3;

-- job_assignments에 댓글 내용 기록 (선택)
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS comment_text text;
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS did_subscribe boolean DEFAULT false;
```

## 7. _watchVideoOnDevice 통합 설계

```javascript
async _watchVideoOnDevice(serial, videoUrl, durationSec, searchKeyword, videoTitle, engagementConfig) {
    // engagementConfig = {
    //     probLike: 15,
    //     probComment: 5,
    //     probSubscribe: 8,
    //     probPlaylist: 3,
    //     channelName: "채널명",
    //     videoId: "VIDEO_ID",
    //     personality: "casual",  // passive|casual|active|superfan
    // }

    const startTime = Date.now();
    const personality = this._getPersonality(serial); // 디바이스별 고정 성격
    const timeWeight = TIME_WEIGHT[new Date().getHours()];

    // 확률 계산
    const probs = {
        like: (engagementConfig.probLike || 15) / 100 * personality.likeMult * timeWeight,
        comment: (engagementConfig.probComment || 5) / 100 * personality.commentMult * timeWeight,
        subscribe: (engagementConfig.probSubscribe || 8) / 100 * personality.subscribeMult * timeWeight,
        playlist: (engagementConfig.probPlaylist || 3) / 100 * personality.likeMult * timeWeight,
    };

    // 액션 실행 시점 결정 (자연스러운 랜덤)
    const likeAt = durationSec * (_randInt(20, 40) / 100);       // 20~40% 시점
    const commentAt = durationSec * (_randInt(40, 65) / 100);    // 40~65% 시점
    const subscribeAt = durationSec * (_randInt(60, 80) / 100);  // 60~80% 시점
    const playlistAt = durationSec * (_randInt(85, 95) / 100);   // 85~95% 시점

    // 각 액션 실행 여부 사전 결정 (일관성)
    const willLike = Math.random() < probs.like;
    const willComment = Math.random() < probs.comment;
    const willSubscribe = Math.random() < probs.subscribe;
    const willPlaylist = Math.random() < probs.playlist;

    // 댓글 사전 생성 (시청 중 API 대기 시간 최소화)
    let commentText = null;
    if (willComment && this.commentGenerator) {
        commentText = await this.commentGenerator.generate(
            videoTitle || '', 
            engagementConfig.channelName || '',
            engagementConfig.videoId || ''
        );
    }

    console.log(`[Engagement] ${serial} plan: like=${willLike} comment=${willComment} sub=${willSubscribe} playlist=${willPlaylist}`);

    // === 기존 시청 루프 ===
    // 화면 깨우기, YouTube 실행, 검색, 재생...
    // ...

    // === 시청 루프 (기존 + 액션 통합) ===
    const targetMs = durationSec * 1000;
    let elapsed = 0;
    const TICK_MS = 5000;
    const actions = { liked: false, commented: false, subscribed: false, playlisted: false };

    while (elapsed < targetMs) {
        const waitMs = Math.min(TICK_MS, targetMs - elapsed);
        await _sleep(waitMs);
        elapsed += waitMs;
        const elapsedSec = elapsed / 1000;

        // 광고 체크 (15초마다)
        if (elapsed % 15000 < TICK_MS) await this._trySkipAd(serial);
        // 화면 깨우기 (30초마다)
        if (elapsed % 30000 < TICK_MS) await this.xiaowei.adbShell(serial, 'input keyevent KEYCODE_WAKEUP');

        // 좋아요
        if (willLike && !actions.liked && elapsedSec >= likeAt) {
            actions.liked = await this._doLike(serial);
        }

        // 댓글
        if (willComment && !actions.commented && elapsedSec >= commentAt && commentText) {
            actions.commented = await this._doComment(serial, commentText);
        }

        // 구독
        if (willSubscribe && !actions.subscribed && elapsedSec >= subscribeAt) {
            actions.subscribed = await this._doSubscribe(serial);
        }

        // 재생목록 저장
        if (willPlaylist && !actions.playlisted && elapsedSec >= playlistAt) {
            actions.playlisted = await this._doSavePlaylist(serial);
        }
    }

    // 홈으로
    await this.xiaowei.goHome(serial);

    return {
        actualDurationSec: Math.round((Date.now() - startTime) / 1000),
        watchPercentage: durationSec > 0 ? Math.min(100, Math.round(((Date.now() - startTime) / 1000 / durationSec) * 100)) : 0,
        ...actions,
        commentText: actions.commented ? commentText : null,
    };
}
```

## 8. 결과 기록

```javascript
// _executeJobAssignment에서 completed 업데이트 시
await this.supabaseSync.supabase
    .from("job_assignments")
    .update({
        status: "completed",
        progress_pct: 100,
        completed_at: new Date().toISOString(),
        final_duration_sec: result.actualDurationSec,
        watch_percentage: result.watchPercentage,
        did_like: result.liked || false,
        did_comment: result.commented || false,
        did_playlist: result.playlisted || false,
        // did_subscribe: result.subscribed || false,  // 컬럼 추가 후
        // comment_text: result.commentText || null,    // 컬럼 추가 후
    })
    .eq("id", assignment.id);
```

## 9. 환경변수 추가 (.env)

```
# ChatGPT API (댓글 생성)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# 또는 Anthropic API
# ANTHROPIC_API_KEY=sk-ant-...

# Engagement 기본값 (videos 테이블에 없을 때)
DEFAULT_PROB_LIKE=15
DEFAULT_PROB_COMMENT=5
DEFAULT_PROB_SUBSCRIBE=8
DEFAULT_PROB_PLAYLIST=3
```

## 10. 구현 순서 (권장)

```
Phase 1: 기본 Engagement (좋아요/구독)
  ├── _doLike, _doSubscribe 메서드 구현
  ├── 확률 시스템 (personality + timeWeight)
  ├── _watchVideoOnDevice에 통합
  └── job_assignments 결과 기록

Phase 2: 댓글 시스템
  ├── CommentGenerator 클래스 (OpenAI API)
  ├── _doComment 메서드 구현
  ├── _inputText 한글 입력 안정화
  └── 댓글 품질 필터

Phase 3: 고급 기능
  ├── 재생목록 저장
  ├── 디바이스별 성격 영구 저장 (DB)
  ├── 워밍업 시퀀스 (연관 영상 탐색)
  └── 통계 대시보드 연동
```

## 11. 주의사항

1. **uiautomator dump 호출 최소화** — 액션당 최대 2~3회 (찾기 + 확인)
2. **액션 간 자연스러운 딜레이** — 좋아요 후 바로 구독은 부자연스러움, 최소 30초 간격
3. **댓글 입력 시 한글 문제** — ADBKeyboard 또는 클립보드 방식 사전 테스트 필요
4. **API 비용 관리** — gpt-4o-mini 기준 댓글 1건당 ~₩1~2, 일 1000건 = ~₩2,000
5. **이미 좋아요/구독한 영상** — selected 상태 체크 후 스킵
6. **스크롤 복귀** — 댓글 후 반드시 영상 재생 위치로 돌아가기
