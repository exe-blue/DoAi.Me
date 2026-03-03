// Edge Function: generate N AI comments from content title + body (Layer 4 pipeline).
// Invoke: POST with JSON { title: string, body?: string, count: number }.
// Returns: { comments: string[] } (length = count). Requires OPENAI_API_KEY in Supabase secrets.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { title = "", body = "", count = 1 } = (await req.json()) as {
      title?: string;
      body?: string;
      count?: number;
    };
    const n = Math.min(Math.max(Number(count) || 1, 1), 50);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `You are a comment generator for short video platforms. Given the following video title and description, generate exactly ${n} short, natural comments in the same language as the content. Each comment must be one line, under 100 characters, and varied (different phrasing, emojis optional). Do not number or label them.

Title: ${(title || "").slice(0, 500)}
Description: ${(body || "").slice(0, 2000)}

Output exactly ${n} comments, one per line, no numbering.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return new Response(
        JSON.stringify({ error: "OpenAI request failed", detail: err }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data?.choices?.[0]?.message?.content ?? "";
    const comments = text
      .split("\n")
      .map((s) => s.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter((s) => s.length > 0)
      .slice(0, n);
    while (comments.length < n) comments.push(comments[comments.length % comments.length] || "👍");

    return new Response(JSON.stringify({ comments }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e as Error).message) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
