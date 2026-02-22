import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; signup?: string; error?: string }>;
}) {
  const supabase = await createAuthServerClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    redirect("/dashboard");
  }

  const { returnTo, signup, error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <svg
              className="h-6 w-6 text-primary-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
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
