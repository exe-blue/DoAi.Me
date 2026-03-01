"use client";

import React from "react";
import { ThemeProvider, createTheme, CssBaseline } from "@mui/material";

/** Brand: Primary = Blue, Accent = Yellow. Background stays neutral. */
export const BRAND = {
  primary: "#1976d2",
  primaryLight: "#42a5f5",
  primaryDark: "#1565c0",
  accent: "#f9a825",
  accentLight: "#ffca28",
  accentDark: "#f57f17",
  background: "#fafafa",
  paper: "#ffffff",
} as const;

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: BRAND.primary,
      light: BRAND.primaryLight,
      dark: BRAND.primaryDark,
    },
    secondary: {
      main: BRAND.accent,
      light: BRAND.accentLight,
      dark: BRAND.accentDark,
    },
    background: {
      default: BRAND.background,
      paper: BRAND.paper,
    },
    success: { main: "#2e7d32" },
    warning: { main: "#ed6c02" },
    error: { main: "#d32f2f" },
    info: { main: BRAND.primary },
  },
  typography: {
    fontFamily: '"Pretendard Variable", system-ui, sans-serif',
  },
  shape: {
    borderRadius: 8,
  },
  shadows: [
    "none",
    "0 1px 2px rgba(0,0,0,0.06)",
    "0 2px 4px rgba(0,0,0,0.06)",
    "0 4px 8px rgba(0,0,0,0.06)",
    "0 8px 16px rgba(0,0,0,0.06)",
    "0 12px 24px rgba(0,0,0,0.08)",
    "0 16px 32px rgba(0,0,0,0.08)",
    "0 20px 40px rgba(0,0,0,0.08)",
    "0 24px 48px rgba(0,0,0,0.08)",
    "0 28px 56px rgba(0,0,0,0.08)",
    "0 32px 64px rgba(0,0,0,0.08)",
    "0 36px 72px rgba(0,0,0,0.08)",
    "0 40px 80px rgba(0,0,0,0.08)",
    "0 44px 88px rgba(0,0,0,0.08)",
    "0 48px 96px rgba(0,0,0,0.08)",
    "0 52px 104px rgba(0,0,0,0.08)",
    "0 56px 112px rgba(0,0,0,0.08)",
    "0 60px 120px rgba(0,0,0,0.08)",
    "0 64px 128px rgba(0,0,0,0.08)",
    "0 68px 136px rgba(0,0,0,0.08)",
    "0 72px 144px rgba(0,0,0,0.08)",
    "0 76px 152px rgba(0,0,0,0.08)",
    "0 80px 160px rgba(0,0,0,0.08)",
    "0 84px 168px rgba(0,0,0,0.08)",
    "0 88px 176px rgba(0,0,0,0.08)",
    "0 92px 184px rgba(0,0,0,0.08)",
  ],
});

export function MuiTheme({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
