REPLACE_MARKER

import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { LoginForm } from "./login-form";
import Image from "next/image";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; signup?: string; error?: string }>;
}) {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }
  const { returnTo, signup, error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-4">
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
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }
  const { returnTo, signup, error } = await searchParams;

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
