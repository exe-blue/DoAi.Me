import { createServerClientWithCookies } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  let session = null;
  try {
    const supabase = await createServerClientWithCookies();
    const { data } = await supabase.auth.getUser();
    session = data.user ? { user: data.user } : null;
  } catch (err) {
    console.error("[Root] Auth check failed:", err);
  }

  if (session) {
    redirect("/ops");
  }

  redirect("/login");
}
