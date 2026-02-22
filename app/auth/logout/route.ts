import { NextRequest, NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

async function signOutAndRedirect(request: NextRequest) {
  const supabase = await createAuthServerClient();
  await supabase.auth.signOut();
  const url = new URL("/", request.url);
  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  return signOutAndRedirect(request);
}

export async function GET(request: NextRequest) {
  return signOutAndRedirect(request);
}
