"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import Image from "next/image";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional illustration (120–180px) shown top-right. Decorative only. */
  illustrationSrc?: string;
  /** Illustration width in px (default 140). */
  illustrationWidth?: number;
  /** Illustration height in px (default auto from width). */
  illustrationHeight?: number;
  /** Right slot (e.g. button). */
  action?: React.ReactNode;
}

/**
 * Page title + optional subtitle + optional small illustration (top-right).
 * Illustration is decorative: alt="" and aria-hidden.
 */
export function PageHeader({
  title,
  subtitle,
  illustrationSrc,
  illustrationWidth = 140,
  illustrationHeight,
  action,
}: Readonly<PageHeaderProps>) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 2,
        mb: 2,
      }}
    >
      <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
        <Typography variant="h4" component="h1" sx={{ mb: subtitle ? 0.5 : 0 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" variant="body2">
            {subtitle}
          </Typography>
        )}
      </Box>
      {(illustrationSrc || action) && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            flexShrink: 0,
          }}
        >
          {action}
          {illustrationSrc && (
            <Box
              sx={{
                width: illustrationWidth,
                height: illustrationHeight ?? illustrationWidth,
                position: "relative",
                display: { xs: "none", sm: "block" },
              }}
              aria-hidden
            >
              <Image
                src={illustrationSrc}
                alt=""
                width={illustrationWidth}
                height={illustrationHeight ?? illustrationWidth}
                style={{ objectFit: "contain" }}
                unoptimized={illustrationSrc.startsWith("/illustrations/") && illustrationSrc.endsWith(".jpg")}
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
