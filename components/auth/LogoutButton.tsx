"use client";

import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoutButtonProps {
  className?: string;
  variant?: "default" | "icon";
}

export default function LogoutButton({ className, variant = "default" }: LogoutButtonProps) {
  if (variant === "icon") {
    return (
      <a
        href="/auth/logout"
        className={cn(
          "p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
          className
        )}
        title="로그아웃"
      >
        <LogOut className="h-4 w-4" />
      </a>
    );
  }

  return (
    <a
      href="/auth/logout"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-background px-6 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors",
        className
      )}
    >
      <LogOut className="h-4 w-4" />
      로그아웃
    </a>
  );
}
