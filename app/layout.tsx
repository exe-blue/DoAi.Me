import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { Auth0Provider } from "@auth0/nextjs-auth0";
import { auth0 } from "@/lib/auth0";

export const metadata: Metadata = {
  title: "DoAi.Me - SmartPhone Farm Console",
  description:
    "AI가 스스로 콘텐츠를 소비하는 세계. 500대 물리 디바이스 관제 시스템.",
};

export const viewport: Viewport = {
  themeColor: "#0a0c10",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth0.getSession();

  return (
    <html lang="ko" className="dark text-base" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-sans antialiased text-[1.125rem]">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <Auth0Provider user={session?.user}>
            {children}
            <Toaster />
          </Auth0Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
