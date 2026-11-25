import React, { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/hooks/use-theme";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { TopProgressBar } from "@/components/TopProgressBar";
import { supabase } from "@/lib/supabase";
import { MaintenanceScreen } from "@/components/MaintenanceScreen";

interface ErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends React.Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    reportLovableError(error, {
      boundary: "react_app_error_boundary",
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground"
        >
          <div className="max-w-md text-center">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Something didn&apos;t load
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected display issue occurred. Please reload to continue.
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center justify-center rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Reload page
              </button>

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function getSafeRouteErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    const trimmed = error.message.trim();
    if (
      trimmed &&
      !trimmed.toLowerCase().includes("postgres") &&
      !trimmed.toLowerCase().includes("supabase") &&
      !trimmed.toLowerCase().includes("sql") &&
      trimmed.length <= 160
    ) {
      return trimmed;
    }
  }
  return "We hit an unexpected issue loading this view. Please try again.";
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-brand-gradient">404</h1>

        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>

        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something didn&apos;t load
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {getSafeRouteErrorMessage(error)}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>

          <a
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: "Vevu Pay (VevuPay) — Pay Bills, Buy Airtime, Data & Exam Pins",
      },
      {
        name: "description",
        content:
          "Vevu Pay (VevuPay): pay electricity & cable bills, buy cheap mobile data & airtime, get WAEC/NECO exam pins, fund betting wallets, and cash out from one wallet.",
      },
      { name: "author", content: "Vevu Pay" },
      { name: "theme-color", content: "#0a1128" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      {
        name: "apple-mobile-web-app-status-bar-style",
        content: "black-translucent",
      },
      { name: "apple-mobile-web-app-title", content: "Vevu Pay" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:site_name", content: "Vevu Pay" },
      {
        property: "og:title",
        content: "Vevu Pay (VevuPay) — Pay Bills, Top Up Airtime & Data",
      },
      {
        property: "og:description",
        content:
          "Vevu Pay lets you pay bills, buy airtime & data, get exam pins, fund betting wallets, and cash out instantly.",
      },
      { property: "og:url", content: "https://vevupay.name.ng/" },
      { property: "og:type", content: "website" },
      {
        property: "og:image",
        content: "https://vevupay.name.ng/vevupay-icon.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Vevu Pay (VevuPay) — Pay Bills, Top Up Airtime & Data",
      },
      {
        name: "twitter:description",
        content:
          "Pay bills, top up airtime & data, buy exam pins, fund betting wallets, and cash out — all from one Vevu Pay wallet.",
      },
      {
        name: "twitter:image",
        content: "https://vevupay.name.ng/vevupay-icon.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: "https://vevupay.name.ng/" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      {
        rel: "icon",
        type: "image/png",
        href: "/vevupay-icon.png",
      },
      {
        rel: "apple-touch-icon",
        href: "/vevupay-icon.png",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebSite",
              "@id": "https://vevupay.name.ng/#website",
              name: "Vevu Pay",
              alternateName: ["VevuPay", "Vevu pay", "vevupay"],
              url: "https://vevupay.name.ng/",
            },
            {
              "@type": "Organization",
              "@id": "https://vevupay.name.ng/#organization",
              name: "Vevu Pay",
              alternateName: ["VevuPay", "Vevu Pay Nigeria"],
              url: "https://vevupay.name.ng/",
              logo: {
                "@type": "ImageObject",
                url: "https://vevupay.name.ng/vevupay-icon.png",
              },
              description:
                "Vevu Pay (VevuPay) is a Nigerian digital wallet and utility payment platform for mobile airtime, data bundles, electricity bills, cable TV subscriptions, betting wallet funding, exam pins, and savings.",
              areaServed: {
                "@type": "Country",
                name: "Nigeria",
              },
            },
          ],
        }),
      },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Capacitor renders this route tree inside the existing mobile/index.html
  // document. The website still uses the normal TanStack Start document shell.
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset.vevupayMobile === "true"
  ) {
    return <>{children}</>;
  }

  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppErrorBoundary>
            <AppContent />
          </AppErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AccessLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-muted border-t-primary" />

        <p className="text-sm font-medium text-foreground">
          Checking access...
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          Please wait.
        </p>
      </div>
    </div>
  );
}

function AppShellOutlet() {
  return (
    <>
      <TopProgressBar />
      <Outlet />

      <Toaster
        position="top-center"
        richColors
        closeButton
        theme="dark"
      />
    </>
  );
}

// Maintenance mode with verified administrator bypass
function AppContent() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const { user, isLoading: authLoading } = useAuth();

  // Public informational & legal pages remain accessible during maintenance.
  const isPublicPage =
    pathname === "/about" ||
    pathname === "/privacy-policy" ||
    pathname === "/terms";

  const maintenanceQuery = useQuery({
    queryKey: ["maintenance-mode"],

    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "maintenance_mode")
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.value ?? {
        is_active: false,
        message:
          "VevuPay is temporarily undergoing maintenance. Please check back shortly.",
      };
    },

    refetchInterval: 30000,
    staleTime: 10000,
    retry: 2,
  });

  const maintenance = maintenanceQuery.data;
  const maintenanceActive = maintenance?.is_active === true;

  // Verify administrator status directly against Supabase.
  // The profile ID must match the authenticated Supabase user ID.
  const adminQuery = useQuery({
    queryKey: ["maintenance-admin-check", user?.id],

    enabled: !authLoading && !!user && maintenanceActive,

    queryFn: async () => {
      if (!user) {
        return false;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();

      // Never grant administrator access if verification fails.
      if (error) {
        return false;
      }

      return data?.is_admin === true;
    },

    staleTime: 30000,
    retry: false,
  });

  if (isPublicPage) {
    return <AppShellOutlet />;
  }

  if (authLoading || maintenanceQuery.isLoading) {
    return <AccessLoadingScreen />;
  }

  if (maintenanceQuery.isError) {
    return (
      <MaintenanceScreen
        message="VevuPay is temporarily unavailable while we verify the platform status. Please try again shortly."
      />
    );
  }

  if (!maintenanceActive) {
    return <AppShellOutlet />;
  }

  if (user && adminQuery.isLoading) {
    return <AccessLoadingScreen />;
  }

  const isVerifiedAdmin = user !== null && adminQuery.data === true;

  if (!isVerifiedAdmin) {
    return (
      <MaintenanceScreen
        message={
          typeof maintenance.message === "string"
            ? maintenance.message
            : "VevuPay is temporarily undergoing maintenance. Please check back shortly."
        }
      />
    );
  }

  return <AppShellOutlet />;
}
