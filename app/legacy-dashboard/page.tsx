import { redirect } from "next/navigation";

/**
 * Legacy dashboard root. All /legacy-dashboard/* URLs are redirected via next.config.js
 * to the (app) dashboard. This page is a fallback if config redirect is not applied.
 */
export default function LegacyDashboardPage() {
  redirect("/dashboard");
}
