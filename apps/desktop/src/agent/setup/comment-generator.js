/**
 * ChatGPT API를 이용한 YouTube 댓글 자동 생성기
 *
 * 사용법:
 *   const gen = new CommentGenerator(process.env.OPENAI_API_KEY);
 *   const comment = await gen.generate("영상 제목", "채널명", "videoId");
 */
const sleep = require("../lib/sleep");

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

const SPAM_KEYWORDS = ["구독", "좋아요", "알림", "홍보", "광고", "http", "www", "링크", "무료", "이벤트", "추천인"];
const AI_KEYWORDS = ["저는 AI", "언어 모델", "도움이 되셨", "감사합니다!", "도움이 되었", "유익한 콘텐츠"];

class CommentGenerator {
  constructor(apiKey, model) {
    this.apiKey = apiKey;
    this.model = model || "gpt-4o-mini";
    this.recentComments = []; // 최근 100개 (중복 방지)
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

        if (!this._isValid(comment)) {
          console.warn(`[CommentGen] Invalid comment (attempt ${attempt + 1}): "${comment}"`);
          continue;
        }

        if (this.recentComments.includes(comment)) {
          console.warn(`[CommentGen] Duplicate comment (attempt ${attempt + 1})`);
          continue;
        }

        this.recentComments.push(comment);
        if (this.recentComments.length > 100) this.recentComments.shift();

        console.log(`[CommentGen] ✓ Generated for "${videoTitle.substring(0, 30)}": "${comment}"`);
        return comment;
      } catch (err) {
        console.error(`[CommentGen] API error (attempt ${attempt + 1}): ${err.message}`);
        if (attempt === 2) return null;
        await sleep(1000);
      }
    }
    return null;
  }

  async _callAPI(videoTitle, channelName) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: COMMENT_SYSTEM_PROMPT },
          {
            role: "user",
            content: `영상 제목: "${videoTitle}"\n채널명: "${channelName}"\n\n댓글:`,
          },
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

    text = text.replace(/^["'"""]|["'"""]$/g, "");

    return text;
  }

  _isValid(comment) {
    if (!comment || comment.length < 5 || comment.length > 100) return false;
    if (SPAM_KEYWORDS.some((s) => comment.includes(s))) return false;
    if (AI_KEYWORDS.some((s) => comment.includes(s))) return false;
    return true;
  }
}

module.exports = CommentGenerator;
