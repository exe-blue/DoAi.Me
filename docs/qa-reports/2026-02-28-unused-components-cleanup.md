# Unused components cleanup report

**Date:** 2026-02-28  
**Scope:** Unused installed components (npm packages + `components/ui/` shadcn-style files) in DoAi.Me.

## Summary

- **npm packages removed:** 16 (root `package.json` only; agent deps were all used).
- **UI component files deleted:** 21 under `components/ui/`.
- **Recommendation:** Run `npm install` after pulling these changes (already run during cleanup).

---

## 1. Unused npm packages (removed)

Criteria: each package was listed in root `package.json` and had **no** `import`/`require` in `app/`, `lib/`, `components/`, `agent/`, `scripts/`, or `tests/`. Only top-level entries were removed; transitive use was not assumed.

| Package | Reason |
|--------|--------|
| `@radix-ui/react-accordion` | Only used by removed `components/ui/accordion.tsx`. |
| `@radix-ui/react-aspect-ratio` | Only used by removed `components/ui/aspect-ratio.tsx`. |
| `@radix-ui/react-collapsible` | Only used by removed `components/ui/collapsible.tsx`. |
| `@radix-ui/react-context-menu` | Only used by removed `components/ui/context-menu.tsx`. |
| `@radix-ui/react-hover-card` | Only used by removed `components/ui/hover-card.tsx`. |
| `@radix-ui/react-menubar` | Only used by removed `components/ui/menubar.tsx`. |
| `@radix-ui/react-navigation-menu` | Only used by removed `components/ui/navigation-menu.tsx`. |
| `@radix-ui/react-popover` | Only used by removed `components/ui/popover.tsx`. |
| `@radix-ui/react-toggle` | Only used by removed `components/ui/toggle.tsx`. |
| `@radix-ui/react-toggle-group` | Only used by removed `components/ui/toggle-group.tsx`. |
| `cmdk` | Only used by removed `components/ui/command.tsx`. |
| `embla-carousel-react` | Only used by removed `components/ui/carousel.tsx`. |
| `input-otp` | Only used by removed `components/ui/input-otp.tsx`. |
| `react-day-picker` | Only used by removed `components/ui/calendar.tsx`. |
| `react-resizable-panels` | Only used by removed `components/ui/resizable.tsx`. |
| `vaul` | Only used by removed `components/ui/drawer.tsx`. |

**Not removed:** `recharts` is still used by `app/(app)/infrastructure/network/network-content.tsx` (direct import). Only the unused wrapper `components/ui/chart.tsx` was deleted.

**Agent `package.json`:** All listed dependencies (`@supabase/supabase-js`, `dotenv`, `winston`, `ws`) are required; no changes.

---

## 2. Unused UI component files (deleted)

Criteria: no static import from `app/`, `components/` (outside `ui/`), or `pages/`. Barrel re-exports under `components/ui/` were checked; there is no `components/ui/index` barrel. Dynamic imports were not used for these.

| File | Reason |
|------|--------|
| `accordion.tsx` | Never imported. |
| `aspect-ratio.tsx` | Never imported. |
| `breadcrumb.tsx` | Never imported. |
| `calendar.tsx` | Never imported. |
| `carousel.tsx` | Never imported. |
| `chart.tsx` | Never imported; network charts use `recharts` directly. |
| `collapsible.tsx` | Never imported. |
| `command.tsx` | Never imported. |
| `context-menu.tsx` | Never imported. |
| `drawer.tsx` | Never imported. |
| `form.tsx` | Never imported (Form/FormField/FormItem etc. unused). |
| `hover-card.tsx` | Never imported. |
| `input-otp.tsx` | Never imported. |
| `menubar.tsx` | Never imported. |
| `navigation-menu.tsx` | Never imported. |
| `pagination.tsx` | Never imported. |
| `popover.tsx` | Never imported. |
| `resizable.tsx` | Never imported. |
| `toaster.tsx` | Not used; app uses `@/components/ui/sonner` in layout. |
| `toggle.tsx` | Only referenced by removed `toggle-group.tsx`. |
| `toggle-group.tsx` | Never imported. |

**Kept:** `toast.tsx` is kept because `hooks/use-toast.ts` and several stores import types and the toast API from it; only the Radix `<Toaster />` in `toaster.tsx` was removed in favor of sonner.

---

## 3. Safety and recommendations

- **Not removed:** React, Next.js, Supabase, TypeScript, Tailwind, Vitest, ESLint, and other core build/test/lint tooling.
- **Tailwind:** `tailwind.config.ts` still defines `accordion-down` / `accordion-up` keyframes; they are harmless with the accordion component removed.
- **Next step:** If you add features that need any of the removed components (e.g. Command palette, Calendar, Carousel, Form with react-hook-form UI), re-add the corresponding shadcn component and its npm dependency.

---

## 4. Files changed

- **Deleted:** 21 files under `components/ui/` (listed above).
- **Modified:** `package.json` (16 dependencies removed via `npm uninstall`).
- **Created:** `docs/qa-reports/2026-02-28-unused-components-cleanup.md` (this report).
