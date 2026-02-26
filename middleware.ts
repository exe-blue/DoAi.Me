import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";

const PUBLIC_PATHS = [
  "/auth",
  "/api/health",
  "/monitoring",
  "/login",
  "/privacy",
  "/agreement",
];
const AUTH_CALLBACK_PATH = "/auth/callback";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === AUTH_CALLBACK_PATH) return true;
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get("x-api-key");
  const validKey = process.env.API_KEY;
  if (!apiKey || !validKey) return false;
  if (apiKey.length !== validKey.length) return false;
  let mismatch = 0;
  for (let i = 0; i < apiKey.length; i++) {
    mismatch |= apiKey.charCodeAt(i) ^ validKey.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });

  if (url && anonKey) {
    const supabase = createServerClient<Database>(url, anonKey, {
      cookies: {
        async getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: object }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            (response as any).cookies.set(name, value, options),
          );
        },
      },
    });

    await supabase.auth.getUser();

    if (!isPublicPath(pathname)) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (isApiRoute(pathname)) {
          if (request.headers.has("x-api-key") && validateApiKey(request)) {
            return response;
          }
          return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
          );
        }
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("returnTo", pathname);
        return NextResponse.redirect(loginUrl);
      }

      if (isApiRoute(pathname) && !request.headers.has("x-api-key")) {
        // API route with session is allowed
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
