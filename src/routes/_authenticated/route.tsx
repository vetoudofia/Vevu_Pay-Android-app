// src/routes/_authenticated/route.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { clearSupabaseClientStorage, supabase } from "@/lib/supabase";

const SAFE_ORIGIN = "https://vevupay.invalid";

function getSafeReturnPath(pathname: string, searchStr?: string): string {
  const combined = `${pathname || ""}${searchStr || ""}`.trim();
  if (
    !combined.startsWith("/") ||
    combined.startsWith("//") ||
    combined.includes("://") ||
    combined.includes("\\")
  ) {
    return "/dashboard";
  }

  try {
    const parsed = new URL(combined, SAFE_ORIGIN);
    if (
      parsed.origin !== SAFE_ORIGIN ||
      !parsed.pathname.startsWith("/") ||
      parsed.pathname.startsWith("//") ||
      parsed.pathname === "/auth" ||
      parsed.pathname.startsWith("/auth/")
    ) {
      return "/dashboard";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/dashboard";
  }
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      clearSupabaseClientStorage({ includeAccountKeys: false });
      const returnTo = getSafeReturnPath(location.pathname, location.searchStr);
      throw redirect({
        to: "/auth",
        search: {
          reason: "expired",
          returnTo,
        },
      });
    }

    if (location.pathname === "/onboarding") {
      return { user };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", user.id)
      .maybeSingle();

    // Distinguish transient database/network errors from a missing profile
    if (profileError) {
      throw new Error("Unable to verify your profile right now. Please retry.");
    }

    if (!profile) {
      throw redirect({ to: "/auth" });
    }

    if (profile.onboarding_completed === false) {
      throw redirect({ to: "/onboarding" });
    }

    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return <AppShell />;
}
