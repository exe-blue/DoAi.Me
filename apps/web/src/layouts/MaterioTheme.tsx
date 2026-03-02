"use client";

import { ThemeProvider, createTheme } from "@mui/material/styles";
import type { ThemeOptions } from "@mui/material/styles";

const materioOptions: ThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#7367F0",
      light: "#9E95F5",
      dark: "#5E50EE",
      contrastText: "#fff",
    },
    secondary: {
      main: "#CE9B00",
      light: "#E4B429",
      dark: "#A67C00",
      contrastText: "#fff",
    },
    background: {
      default: "#F4F5FA",
      paper: "#fff",
    },
  },
  typography: {
    fontFamily: '"Public Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
};

const theme = createTheme(materioOptions);

export function MaterioTheme({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
