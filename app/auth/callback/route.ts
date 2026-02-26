import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

function safeRedirectPath(next: string | null, origin: string): string {
  const path = next ?? "/dashboard";
  if (typeof path !== "string" || path === "") return "/dashboard";
  if (path.startsWith("/") && !path.startsWith("//")) {
    try {
      const url = new URL(path, origin);
      if (url.origin === origin) return url.pathname + url.search;
    } catch {
      // invalid URL
    }
  }
  return "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const targetPath = safeRedirectPath(next, origin);
      return NextResponse.redirect(new URL(targetPath, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", origin));
}
