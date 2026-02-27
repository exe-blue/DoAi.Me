import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { LoginForm } from "./login-form";
import { DottedBackground } from "@/components/dotted-background";
import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; signup?: string; error?: string }>;
}) {
  // Try to create Supabase client - if credentials are missing, show setup error
  let user = null;
  let setupError = null;
  let supabase;
  try {
    supabase = await createAuthServerClient();
  } catch (err) {
    setupError = err instanceof Error ? err.message : "Supabase client initialization failed";
    console.error("[Login] Supabase initialization failed:", err);
  }
  if (supabase) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  const { returnTo, signup, error } = await searchParams;

  if (user) {
    // Same-origin path only to avoid open redirect
    const safePath =
      typeof returnTo === "string" &&
      returnTo.startsWith("/") &&
      !returnTo.startsWith("//")
        ? returnTo
        : "/dashboard";
    redirect(safePath);
  }

  // If Supabase is not configured, show setup instructions
  if (setupError) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background">
        <DottedBackground />
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary">
              <Image
                src="/images/logo.PNG"
                alt="DoAi.Me"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold">DoAi.Me</h1>
              <p className="text-sm text-muted-foreground">Console</p>
            </div>
          </div>
          <div className="w-full rounded-lg border border-destructive/50 bg-destructive/10 p-6">
            <h2 className="mb-4 text-lg font-semibold text-destructive">
              Supabase Setup Required
            </h2>
            <pre className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {setupError}
            </pre>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background">
      <DottedBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary">
            <Image
              src="/images/logo.PNG"
              alt="DoAi.Me"
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold">DoAi.Me</h1>
            <p className="text-sm text-muted-foreground">Console</p>
          </div>
        </div>
        <p className="text-center text-muted-foreground">
          스마트폰 팜 관제 시스템에 로그인하세요.
        </p>
        {error === "auth" && (
          <p className="text-sm text-destructive">인증 처리에 실패했습니다.</p>
        )}
        <LoginForm
          returnTo={returnTo ?? "/dashboard"}
          isSignUp={signup === "1"}
        />
      </div>
    </div>
  );
}
