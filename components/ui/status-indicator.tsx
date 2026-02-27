import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge, type BadgeProps } from "@/components/ui/badge"

/**
 * Semantic status variants used across the application.
 *
 *   success  → online / completed / connected
 *   warning  → running / pending / task_created
 *   error    → error / offline (critical) / failed
 *   info     → queued / info
 *   neutral  → stopped / debug / offline (benign)
 */
export type StatusVariant = "success" | "warning" | "error" | "info" | "neutral"

/* ── Utility class maps ────────────────────────────── */

const dotStyles: Record<StatusVariant, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  error: "bg-status-error",
  info: "bg-status-info",
  neutral: "bg-status-neutral",
}

const textStyles: Record<StatusVariant, string> = {
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
  info: "text-status-info",
  neutral: "text-status-neutral",
}

const badgeStyles: Record<StatusVariant, string> = {
  success: "border-status-success/30 text-status-success",
  warning: "border-status-warning/30 text-status-warning",
  error: "border-status-error/30 text-status-error",
  info: "border-status-info/30 text-status-info",
  neutral: "border-status-neutral/30 text-status-neutral",
}

const borderStyles: Record<StatusVariant, string> = {
  success: "border-status-success/40",
  warning: "border-status-warning/40",
  error: "border-status-error/40",
  info: "border-status-info/40",
  neutral: "border-status-neutral/40",
}

const bgSubtleStyles: Record<StatusVariant, string> = {
  success: "bg-status-success/10",
  warning: "bg-status-warning/10",
  error: "bg-status-error/5",
  info: "bg-status-info/10",
  neutral: "bg-status-neutral/5",
}

/* ── Class getter functions ────────────────────────── */

/** Background color class for dots / indicators. */
export function statusDotClass(variant: StatusVariant) {
  return dotStyles[variant]
}

/** Foreground text color class. */
export function statusTextClass(variant: StatusVariant) {
  return textStyles[variant]
}

/** Combined border + text color class for Badge outlines. */
export function statusBadgeClass(variant: StatusVariant) {
  return badgeStyles[variant]
}

/** Border-only class (40 % opacity). */
export function statusBorderClass(variant: StatusVariant) {
  return borderStyles[variant]
}

/** Subtle background tint for row highlights. */
export function statusBgSubtleClass(variant: StatusVariant) {
  return bgSubtleStyles[variant]
}

/* ── Components ────────────────────────────────────── */

/**
 * Small colored circle indicator.
 */
export function StatusDot({
  variant,
  className,
  size = "md",
  pulse = false,
}: {
  variant: StatusVariant
  className?: string
  size?: "sm" | "md" | "lg"
  pulse?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-full",
        size === "sm" && "h-1.5 w-1.5",
        size === "md" && "h-2.5 w-2.5",
        size === "lg" && "h-3 w-3",
        dotStyles[variant],
        pulse && "animate-pulse",
        className,
      )}
    />
  )
}

/**
 * Badge with status-appropriate border and text colors.
 */
export function StatusBadge({
  variant,
  className,
  children,
  ...props
}: {
  variant: StatusVariant
  children: React.ReactNode
} & Omit<BadgeProps, "variant">) {
  return (
    <Badge
      variant="outline"
      className={cn(badgeStyles[variant], className)}
      {...props}
    >
      {children}
    </Badge>
  )
}
