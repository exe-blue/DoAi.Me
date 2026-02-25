"use client";

import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import type { ReactNode } from "react";

const SWR_DEFAULT_REFRESH_INTERVAL = 30_000; // 30s

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        refreshInterval: SWR_DEFAULT_REFRESH_INTERVAL,
        revalidateOnFocus: true,
        shouldRetryOnError: true,
        errorRetryCount: 2,
        dedupingInterval: 5_000,
        onError(err, key) {
          if (err && "status" in err && err.status === 401) {
            if (typeof window !== "undefined" && window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
            return;
          }
          console.error(`[SWR] ${key}:`, err?.message ?? err);
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
