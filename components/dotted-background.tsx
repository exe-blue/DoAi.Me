"use client";

import React from "react";
import { DottedSurface } from "@/components/ui/dotted-surface";

export const DottedBackground = React.memo(function DottedBackground() {
  return <DottedSurface className="min-h-screen w-full" />;
});
