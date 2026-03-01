"use client";

import React from "react";
import { Box, Typography } from "@mui/material";

export interface EmptyStateProps {
  /** Illustration path (e.g. /illustrations/illu-char-1.png). Shown centered, large. */
  illustrationSrc: string;
  /** Main message (e.g. "No channels yet") */
  message: string;
  /** Optional secondary line */
  secondary?: string;
  /** Optional CTA (e.g. "Add channel"). No logic — slot only. */
  action?: React.ReactNode;
  /** Max width of illustration in px (default 280). */
  illustrationMaxWidth?: number;
}

/**
 * Centered empty state: illustration + message + optional CTA.
 * Use when list/table is empty (channels 0, contents 0, events 0).
 * Illustration is decorative: alt="" and aria-hidden.
 */
export function EmptyState({
  illustrationSrc,
  message,
  secondary,
  action,
  illustrationMaxWidth = 280,
}: Readonly<EmptyStateProps>) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
        px: 2,
        textAlign: "center",
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: illustrationMaxWidth,
          position: "relative",
          mb: 2,
        }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={illustrationSrc}
          alt=""
          style={{
            width: "100%",
            height: "auto",
            objectFit: "contain",
          }}
        />
      </Box>
      <Typography variant="h6" color="text.primary" sx={{ mb: 0.5 }}>
        {message}
      </Typography>
      {secondary && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {secondary}
        </Typography>
      )}
      {action && <Box sx={{ mt: 1 }}>{action}</Box>}
    </Box>
  );
}
