import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AppProviders } from "./providers";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "DoAi.Me - SmartPhone Farm Console",
  description:
    "AI가 스스로 콘텐츠를 소비하는 세계. 500대 물리 디바이스 관제 시스템.",
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark text-base" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/images/logo.png" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        {/* Pretendard - 본문 */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 나눔스퀘어 네오 - 제목 */}
        <link
          rel="stylesheet"
          href="https://hangeul.pstatic.net/hangeul_static/css/nanum-square-neo.css"
        />
      </head>
      <body className="font-sans antialiased text-[1.125rem]">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <AppProviders>
            {children}
          </AppProviders>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
