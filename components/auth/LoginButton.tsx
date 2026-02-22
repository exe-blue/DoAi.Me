"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface LoginButtonProps {
  className?: string;
  returnTo?: string;
}

export default function LoginButton({ className, returnTo }: LoginButtonProps) {
  const handleLogin = () => {
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo ?? "/dashboard")}`,
      },
    });
  };

  return (
    <button
      onClick={handleLogin}
      className={cn(
        "inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors",
        className
      )}
    >
      로그인
    </button>
  );
}
