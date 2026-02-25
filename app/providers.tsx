"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { toast } from "sonner";
import type { ReactNode } from "react";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        shouldRetryOnError: true,
        errorRetryCount: 2,
        dedupingInterval: 5_000,
        onError(err, key) {
          if (err?.status === 401) {
            if (window.location.pathname === "/login") return;
            window.location.href = "/login";
            return;
          }          console.error(`[SWR] ${key}:`, err?.message);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
