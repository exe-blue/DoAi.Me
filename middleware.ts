import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

const PUBLIC_PATHS = ["/auth", "/api/health", "/monitoring", "/login"];

function isPublicPath(pathname: string): boolean {
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

  // 1. Public paths — no auth
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2. Auth0 middleware handles session cookie refresh
  const authRes = await auth0.middleware(request);

  // 3. API routes: accept API key OR Auth0 session
  if (isApiRoute(pathname)) {
    if (request.headers.has("x-api-key")) {
      if (validateApiKey(request)) {
        return NextResponse.next();
      }
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const session = await auth0.getSession(request);
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    return authRes;
  }

  // 4. Dashboard pages: require session, redirect to login if missing
  const session = await auth0.getSession(request);
  if (!session) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return authRes;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
