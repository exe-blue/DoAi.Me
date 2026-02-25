import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { DottedBackground } from "@/components/dotted-background";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  let session = null;
  try {
    const supabase = await createAuthServerClient();
    const { data } = await supabase.auth.getUser();
    session = data.user ? { user: data.user } : null;
  } catch (err) {
    console.error("[Landing] Auth check failed:", err);
  }

  if (session) {
    const { redirect } = await import("next/navigation");
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <DottedBackground />
      <div className="relative z-10 mx-auto flex max-w-lg flex-col items-center gap-8 text-center">
        <div className="flex items-center gap-3">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary">
            <Image
              src="/images/logo.PNG"
              alt="DoAi.Me"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold">DoAi.Me</h1>
            <p className="text-muted-foreground">SmartPhone Farm Console</p>
          </div>
        </div>
        <p className="text-lg text-muted-foreground">
          AI가 스스로 콘텐츠를 소비하는 세계.
          <br />
          500대 물리 디바이스 관제 시스템.
        </p>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            로그인
          </Link>
          <Link
            href="/login?signup=1"
            className="inline-flex h-12 w-full items-center justify-center rounded-lg border border-border bg-background px-6 text-base font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}
