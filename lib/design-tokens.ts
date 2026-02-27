/**
 * DoAi.Me Design Tokens (JS/TS)
 *
 * CSS 변수는 app/globals.css :root에 정의되어 있고,
 * Tailwind가 hsl(var(--name))로 사용합니다.
 * 이 파일은 컴포넌트/스토리에서 토큰 이름·스케일을 참조할 때 사용합니다.
 *
 * @see docs/DESIGN_SYSTEM.md
 */

/** CSS variable names for colors (without --) */
export const colorTokens = {
  background: "background",
  foreground: "foreground",
  card: "card",
  cardForeground: "card-foreground",
  primary: "primary",
  primaryForeground: "primary-foreground",
  secondary: "secondary",
  secondaryForeground: "secondary-foreground",
  muted: "muted",
  mutedForeground: "muted-foreground",
  accent: "accent",
  accentForeground: "accent-foreground",
  destructive: "destructive",
  destructiveForeground: "destructive-foreground",
  border: "border",
  input: "input",
  ring: "ring",
  popover: "popover",
  popoverForeground: "popover-foreground",
  status: {
    success: "status-success",
    warning: "status-warning",
    error: "status-error",
    info: "status-info",
    neutral: "status-neutral",
  },
  sidebar: {
    background: "sidebar-background",
    foreground: "sidebar-foreground",
    primary: "sidebar-primary",
    "primary-foreground": "sidebar-primary-foreground",
    primaryForeground: "sidebar-primary-foreground",
    accent: "sidebar-accent",
    "accent-foreground": "sidebar-accent-foreground",
    accentForeground: "sidebar-accent-foreground",
    border: "sidebar-border",
    ring: "sidebar-ring",
  },
} as const;

/** Typography scale (Tailwind class names) */
export const typography = {
  pageTitle: "text-2xl font-semibold",
  sectionTitle: "text-lg font-medium",
  cardTitle: "text-base font-medium",
  body: "text-sm",
  caption: "text-xs text-muted-foreground",
  mono: "text-sm font-mono",
} as const;

/** Spacing (Tailwind class names) */
export const spacing = {
  pagePadding: "p-4",
  sectionGap: "gap-6",
  cardPadding: "p-4",
  cardGap: "gap-3",
  formGroup: "space-y-2",
} as const;

/** Border radius (Tailwind) */
export const radius = {
  xl: "rounded-xl",
  lg: "rounded-lg",
  md: "rounded-md",
  sm: "rounded-sm",
} as const;
