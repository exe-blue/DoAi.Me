"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export default function Profile({ className, size = "md" }: ProfileProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user: u }, error }) => {
      if (error) {
        console.error("[Profile] getUser error:", error);
        setUser(null);
      } else {
        setUser(u ?? null);
      }
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return null;

  const email = user.email ?? "";
  const name = ((user.user_metadata?.name as string) ?? email).trim();
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((s: string) => s[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const avatarSize = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-20 w-20" : "h-14 w-14";
  const nameSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  const emailSize = size === "sm" ? "text-xs" : "text-sm";

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Avatar className={avatarSize}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className={size === "lg" ? "text-lg" : "text-sm"}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="text-center">
        <p className={cn("font-medium text-foreground", nameSize)}>{name}</p>
        {email && name !== email && (
          <p className={cn("text-muted-foreground", emailSize)}>{email}</p>
        )}
      </div>
    </div>
  );
}
