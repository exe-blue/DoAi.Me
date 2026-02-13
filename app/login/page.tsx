import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { Smartphone } from "lucide-react";

export default async function LoginPage() {
  const session = await auth0.getSession();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Smartphone className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">DoAi.Me</h1>
            <p className="text-sm text-muted-foreground">Console</p>
          </div>
        </div>
        <p className="text-center text-muted-foreground">
          스마트폰 팜 관제 시스템에 로그인하세요.
        </p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/auth/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          로그인
        </a>
      </div>
    </div>
  );
}
