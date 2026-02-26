"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface LoginButtonProps {
  className?: string;
  returnTo?: string;
}

export default function LoginButton({ className, returnTo }: LoginButtonProps) {
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    const supabase = createClient();
    if (!supabase) {
      setError("로그인 클라이언트를 사용할 수 없습니다.");
      return;
    }
    setError(null);
    try {
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo ?? "/dashboard")}`,
        },
      });
      if (err) {
        console.error("[LoginButton] signInWithOAuth error:", err);
        setError(err.message || "로그인에 실패했습니다.");
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e) {
      console.error("[LoginButton] signInWithOAuth exception:", e);
      setError("로그인 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handleLogin}
        className={cn(
          "inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors",
          className
        )}
      >
        로그인
      </button>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
