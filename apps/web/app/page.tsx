import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { redirect } from "next/navigation";
import { LandingNavigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { BentoGrid } from "@/components/landing/bento-grid";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  let session = null;
  try {
    const supabase = await createAuthServerClient();
    const { data } = await supabase.auth.getUser();
    session = data.user ? { user: data.user } : null;
  } catch (err) {
    console.error("[Landing] Auth check failed:", err);
  }

  if (session) {
    redirect("/ops");
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <LandingNavigation />
      <HeroSection />
      <BentoGrid />
    </div>
  );
}
