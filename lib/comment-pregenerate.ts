/**
 * Pre-generate comment pool for a task (video). Used after task + task_devices are created.
 * Pool size: min(100, ceil(totalDevices * (commentProb/100) * 2)). Agent uses comment_content from config when comment_status = 'ready'.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OPENAI_MODEL = "gpt-4o-mini";
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
- 댓글만 출력하세요. 따옴표나 설명 없이 댓글 텍스트만.`;

const SPAM_KEYWORDS = ["구독", "좋아요", "알림", "홍보", "광고", "http", "www", "링크", "무료", "이벤트", "추천인"];
const AI_KEYWORDS = ["저는 AI", "언어 모델", "도움이 되셨", "감사합니다!", "도움이 되었", "유익한 콘텐츠"];

function isValid(comment: string): boolean {
  if (!comment || comment.length < 5 || comment.length > 100) return false;
  if (SPAM_KEYWORDS.some((s) => comment.includes(s))) return false;
  if (AI_KEYWORDS.some((s) => comment.includes(s))) return false;
  return true;
}

async function generateOneComment(
  apiKey: string,
  videoTitle: string,
  channelName: string,
  attempt = 0
): Promise<string | null> {
  if (attempt >= 3) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
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
  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${res.statusText}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  let text = (data.choices?.[0]?.message?.content ?? "").trim();
  const quoteTrim = /^["'\u201c\u201d\u2018\u2019]+|["'\u201c\u201d\u2018\u2019]+$/g;
  text = text.replace(quoteTrim, "");
  if (!isValid(text)) return generateOneComment(apiKey, videoTitle, channelName, attempt + 1);
  return text;
}

/** Generate up to `count` unique comments (with concurrency limit). */
async function generateCommentPool(
  apiKey: string,
  videoTitle: string,
  channelName: string,
  count: number
): Promise<string[]> {
  const CONCURRENCY = 10;
  const pool: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i += CONCURRENCY) {
    const batch = Array.from({ length: Math.min(CONCURRENCY, count - i) }, () =>
      generateOneComment(apiKey, videoTitle, channelName)
    );
    const results = await Promise.all(batch);
    for (const c of results) {
      if (c && !seen.has(c)) {
        seen.add(c);
        pool.push(c);
      }
    }
  }
  return pool;
}

/**
 * Fill task_devices for a task with a comment pool (round-robin). Updates config.comment_content and comment_status = 'ready'.
 */
export async function fillTaskDevicesWithCommentPool(
  taskId: string,
  commentPool: string[]
): Promise<{ filled: number }> {
  if (commentPool.length === 0) return { filled: 0 };
  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("task_devices")
    .select("id, config")
    .eq("task_id", taskId)
    .eq("status", "pending")
    .returns<Array<{ id: string; config: Record<string, unknown> | null }>>();
  if (error) {
    throw new Error(`task_devices select: ${error.message}`);
  }
  if (!rows?.length) return { filled: 0 };
  let filled = 0;
  for (let i = 0; i < rows.length; i++) {
    const comment = commentPool[i % commentPool.length];
    const config = (rows[i].config ?? {}) as Record<string, unknown>;
    const { error: upErr } = await supabase
      .from("task_devices")
      .update({
        config: { ...config, comment_content: comment },
        comment_status: "ready",
      })
      .eq("id", rows[i].id);
    if (!upErr) filled++;
  }
  return { filled };
}

/**
 * Generate comment pool for a task and fill its task_devices. Call after task + task_devices exist.
 * N = min(100, ceil(totalDevices * (commentProb/100) * 2)). Uses video title; description used if available.
 */
export async function generateAndFillCommentsForTask(taskId: string): Promise<{ ok: true; filled: number } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not set" };
  }
  const supabase = createSupabaseServerClient();

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .select("video_id, payload")
    .eq("id", taskId)
    .single();
  if (taskErr || !task) {
    return { ok: false, error: taskErr?.message ?? "Task not found" };
  }

  const videoId = (task as { video_id?: string }).video_id;
  if (!videoId) {
    return { ok: false, error: "Task has no video_id" };
  }

  const { data: video, error: videoErr } = await supabase
    .from("videos")
    .select("title, description")
    .eq("id", videoId)
    .maybeSingle();
  if (videoErr) {
    return { ok: false, error: videoErr.message };
  }
  const title = (video as { title?: string } | null)?.title ?? "";
  const channelName = "";

  const { count, error: countErr } = await supabase
    .from("task_devices")
    .select("id", { count: "exact", head: true })
    .eq("task_id", taskId);
  if (countErr) {
    return { ok: false, error: countErr.message };
  }
  const totalDevices = count ?? 0;
  const payload = ((task as { payload?: Record<string, unknown> }).payload ?? {}) as Record<string, unknown>;
  const commentProb = typeof payload.commentProb === "number" ? payload.commentProb : 10;
  const poolSize = Math.min(100, Math.max(1, Math.ceil(totalDevices * (commentProb / 100) * 2)));

  let pool: string[];
  try {
    pool = await generateCommentPool(apiKey, title, channelName, poolSize);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "OpenAI comment generation failed" };
  }
  if (pool.length === 0) {
    return { ok: true, filled: 0 };
  }

  const { filled } = await fillTaskDevicesWithCommentPool(taskId, pool);
  return { ok: true, filled };
}
