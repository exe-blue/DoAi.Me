export type StatusVariant = "warning" | "info" | "success" | "neutral" | "error";

const TEXT_CLASS: Record<StatusVariant, string> = {
  warning: "text-yellow-500",
  info: "text-blue-500",
  success: "text-green-500",
  neutral: "text-gray-400",
  error: "text-red-500",
};

const BADGE_CLASS: Record<StatusVariant, string> = {
  warning: "border-yellow-500/50 text-yellow-500 bg-yellow-500/10",
  info: "border-blue-500/50 text-blue-500 bg-blue-500/10",
  success: "border-green-500/50 text-green-500 bg-green-500/10",
  neutral: "border-gray-500/50 text-gray-400 bg-gray-500/10",
  error: "border-red-500/50 text-red-500 bg-red-500/10",
};

const DOT_CLASS: Record<StatusVariant, string> = {
  warning: "bg-yellow-500",
  info: "bg-blue-500",
  success: "bg-green-500",
  neutral: "bg-gray-400",
  error: "bg-red-500",
};

export function statusTextClass(variant: StatusVariant): string {
  return TEXT_CLASS[variant] ?? TEXT_CLASS.neutral;
}

export function statusBadgeClass(variant: StatusVariant): string {
  return BADGE_CLASS[variant] ?? BADGE_CLASS.neutral;
}

export function statusDotClass(variant: StatusVariant): string {
  return DOT_CLASS[variant] ?? DOT_CLASS.neutral;
}
