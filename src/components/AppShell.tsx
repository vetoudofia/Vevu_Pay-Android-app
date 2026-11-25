// src/components/AppShell.tsx
import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home, Wallet, History, Settings, LogOut, Moon, Sun, Grid3x3 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import {
  registerAndroidDevice,
  syncAndroidPushTokenIfPermitted,
} from "@/native/device-registration";

const navItems = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/all-services", label: "Services", icon: Grid3x3 },
  { to: "/fund-wallet", label: "Fund", icon: Wallet },
  { to: "/transactions", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell() {
  const { theme, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user?.id) return;
    void registerAndroidDevice()
      .then(() => syncAndroidPushTokenIfPermitted())
      .catch((error) => {
        console.warn("VevuPay Android device/notification registration was not completed.", error);
      });
  }, [user?.id]);

  // Onboarding is a fullscreen experience — no shell wrapper
  if (location.pathname === "/onboarding") {
    return <Outlet />;
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="vevupay-app-shell min-h-screen flex flex-col bg-background text-foreground">
      <header className="vevupay-app-header sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Logo size={32} withWordmark />
          </Link>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleSignOut}
              aria-label="Sign out"
              className="rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="vevupay-app-content mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-6">
        <Outlet />
      </main>

      <nav className="vevupay-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl">
        <ul className="mx-auto flex max-w-4xl items-center justify-around">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              location.pathname === to || (to === "/dashboard" && location.pathname === "/");
            return (
              <li key={to}>
                <Link
                  to={to}
                  className={`flex min-w-[3.5rem] flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs transition ${
                    active ? "text-brand-gradient font-semibold" : "text-muted-foreground"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
