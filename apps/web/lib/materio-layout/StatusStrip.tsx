"use client";

import React from "react";
import { Box } from "@mui/material";
import { BRAND } from "./MuiTheme";

/**
 * Thin top strip: blue + yellow accent. No content — decoration only.
 * Use once per layout (e.g. above main content or in header).
 */
export function StatusStrip() {
  return (
    <Box
      aria-hidden
      sx={{
        height: 4,
        background: `linear-gradient(90deg, ${BRAND.primary} 0%, ${BRAND.primary} 70%, ${BRAND.accent} 100%)`,
        flexShrink: 0,
      }}
    />
  );
}
