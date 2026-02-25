/**
 * YouTube Commander supported actions (mirrors youtube_commander.js).
 * Used for GET /api/youtube/actions and request validation.
 */
export const YOUTUBE_COMMANDER_ACTIONS: Record<
  string,
  { desc: string; params?: Record<string, string> }
> = {
  closeAllWindows: { desc: "창 화면에서 모두 닫기 후 홈" },
  launch: { desc: "YouTube 앱 실행", params: { pkg: "str", url: "str", fromScratch: "bool" } },
  home: { desc: "홈 화면으로 이동" },
  back: { desc: "뒤로 가기" },
  search: { desc: "검색", params: { query: "str (required)" } },
  play: { desc: "재생" },
  pause: { desc: "일시정지" },
  toggle_play: { desc: "재생/일시정지 토글" },
  seek: { desc: "탐색 슬라이더 이동", params: { percent: "int 0-100" } },
  fullscreen: { desc: "전체화면", params: { enable: "bool" } },
  caption: { desc: "자막 토글" },
  skip_ad: { desc: "광고 건너뛰기", params: { maxWait: "int ms" } },
  wait_ad: { desc: "광고 종료 대기", params: { checkInterval: "int ms" } },
  like: { desc: "좋아요", params: { verify: "bool" } },
  unlike: { desc: "좋아요 취소" },
  dislike: { desc: "싫어요" },
  subscribe: { desc: "구독", params: { notify: "bool" } },
  unsubscribe: { desc: "구독 취소" },
  share: { desc: "공유" },
  save_to_playlist: { desc: "재생목록 저장", params: { playlistName: "str" } },
  comment: { desc: "댓글 작성", params: { text: "str (required)", verify: "bool" } },
  comment_like: { desc: "댓글 좋아요", params: { index: "int" } },
  comment_reply: { desc: "댓글 답글", params: { index: "int", text: "str" } },
  comment_sort: { desc: "댓글 정렬", params: { by: "인기|최신" } },
  warmup: {
    desc: "아이디 예열",
    params: { mode: "home|sidebar|autoplay|hashtag", count: "int", watchDuration: "[min_ms, max_ms]" },
  },
  full_engage: {
    desc: "완전 참여 시나리오",
    params: { watchMs: "int", commentText: "str", subscribe: "bool" },
  },
  get_state: { desc: "현재 상태 조회" },
};

export function isSupportedAction(action: string): boolean {
  return action in YOUTUBE_COMMANDER_ACTIONS;
}
