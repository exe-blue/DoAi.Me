/**
 * comment-generator.js — OpenAI API 기반 YouTube 댓글 자동 생성
 *
 * 영상 제목/채널명으로 자연스러운 한국어 댓글을 생성.
 * 중복 방지 + 품질 필터 내장.
 *
 * 사용법:
 *   const CommentGenerator = require('./comment-generator');
 *   const gen = new CommentGenerator(process.env.OPENAI_API_KEY);
 *   const comment = await gen.generate('영상 제목', '채널명');
 */

const SYSTEM_PROMPT = `당신은 YouTube 영상을 보고 댓글을 다는 일반 한국인 시청자입니다.

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
- "3:25 여기 부분 미쳤다 진짜"`;

const SPAM_KEYWORDS = ['구독', '좋아요', '홍보', '광고', 'http', 'www', '링크', '팔로우'];
const AI_SMELL = ['저는 AI', '언어 모델', '도움이 되셨', '감사합니다!', '도움이 되었'];

class CommentGenerator {
  /**
   * @param {string} apiKey - OpenAI API Key
   * @param {object} [options]
   * @param {string} [options.model] - 모델명 (기본: gpt-4o-mini)
   * @param {number} [options.maxRetries] - 품질 필터 실패 시 재시도 횟수
   */
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    this.maxRetries = options.maxRetries || 3;
    this.recentComments = [];
    this._maxRecent = 100;
  }

  /**
   * 영상 정보로 댓글 생성
   * @param {string} videoTitle - 영상 제목
   * @param {string} channelName - 채널명
   * @returns {Promise<string|null>} 댓글 텍스트 또는 null (실패 시)
   */
  async generate(videoTitle, channelName) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const comment = await this._callAPI(videoTitle, channelName);

        if (!this._isValid(comment)) {
          console.log(`[CommentGen] 품질 필터 탈락 (${attempt + 1}/${this.maxRetries}): "${comment}"`);
          continue;
        }

        if (this.recentComments.includes(comment)) {
          console.log(`[CommentGen] 중복 감지 (${attempt + 1}/${this.maxRetries}): "${comment}"`);
          continue;
        }

        this.recentComments.push(comment);
        if (this.recentComments.length > this._maxRecent) this.recentComments.shift();

        console.log(`[CommentGen] ✓ 생성: "${comment}" (model: ${this.model})`);
        return comment;
      } catch (err) {
        console.error(`[CommentGen] API 에러 (${attempt + 1}/${this.maxRetries}): ${err.message}`);
      }
    }

    console.error(`[CommentGen] ✗ ${this.maxRetries}회 시도 후 생성 실패`);
    return null;
  }

  /**
   * OpenAI API 호출
   * @private
   */
  async _callAPI(videoTitle, channelName) {
    const userMessage = `영상 제목: "${videoTitle || '제목 없음'}"\n채널명: "${channelName || '채널 없음'}"\n\n이 영상에 달 댓글 하나를 작성해주세요. 댓글만 출력하세요.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 100,
        temperature: 1.1,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API ${response.status}: ${errBody.substring(0, 200)}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from OpenAI');

    return text.replace(/^["']|["']$/g, '');
  }

  /**
   * 댓글 품질 필터
   * @private
   */
  _isValid(comment) {
    if (!comment || comment.length < 5 || comment.length > 100) return false;
    if (SPAM_KEYWORDS.some(s => comment.includes(s))) return false;
    if (AI_SMELL.some(s => comment.includes(s))) return false;
    return true;
  }
}

module.exports = CommentGenerator;
