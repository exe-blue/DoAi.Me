"use client";

import React from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-bold">Sentry Example Page</h1>
      <p className="text-muted-foreground text-center max-w-md">
        아래 버튼을 클릭하면 의도적으로 에러를 발생시켜 Sentry에 전송합니다.
        Sentry 대시보드에서 에러가 나타나는지 확인하세요.
      </p>

      <div className="flex gap-4">
        <button
          type="button"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          onClick={() => {
            // Sentry 대시보드에 정상적으로 에러가 잡히도록 의도적으로 에러를 발생시킵니다.
            throw new Error("Sentry Frontend Test Error — 프론트엔드 테스트");
          }}
        >
          클라이언트 에러 발생
        </button>

        <button
          type="button"
          className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
          onClick={async () => {
            const res = await fetch("/api/sentry-example-api");
            if (!res.ok) {
              Sentry.captureMessage("Server API returned error", "warning");
            }
          }}
        >
          서버 에러 발생
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        에러 발생 후{" "}
        <a
          href="https://reblue-inc.sentry.io/issues/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-primary"
        >
          Sentry 대시보드
        </a>
        에서 확인하세요.
      </p>
    </div>
  );
}
