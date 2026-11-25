import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  UserCircle,
  Shield,
  Moon,
  Sun,
  LogOut,
  ChevronRight,
  Users,
  EyeOff,
  AlertTriangle,
  Loader2,
  MessageCircle,
  Ticket,
  Smartphone,
  ArrowDown,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const ANDROID_APK_URL =
  "https://azcrgmirieqpamhabjyh.supabase.co/storage/v1/object/public/app-releases/base.apk";

const WRAPPER_STORAGE_KEY = "vevupay_android_wrapper";

function isSafeHttpsUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function detectAndroidWrapper(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const hasAppMintBridge =
      typeof (window as unknown as { AppMintAds?: unknown }).AppMintAds !==
      "undefined";

    if (hasAppMintBridge) {
      window.sessionStorage.setItem(WRAPPER_STORAGE_KEY, "1");
      return true;
    }

    const params = new URLSearchParams(window.location.search);
    const wrapperParam =
      params.get("wrapper") || params.get("app") || params.get("source");

    if (
      wrapperParam === "apk" ||
      wrapperParam === "android" ||
      wrapperParam === "webview"
    ) {
      window.sessionStorage.setItem(WRAPPER_STORAGE_KEY, "1");
      return true;
    }

    if (window.sessionStorage.getItem(WRAPPER_STORAGE_KEY) === "1") {
      return true;
    }
  } catch {
    // Ignore storage or window access errors.
  }

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

  const isAndroidWebView =
    /\bwv\b/i.test(ua) ||
    (/Android/i.test(ua) && /\bVersion\/[\d.]+/i.test(ua)) ||
    /vevupay[-_]?app|web2app|webview|appmint/i.test(ua);

  if (isAndroidWebView) {
    try {
      window.sessionStorage.setItem(WRAPPER_STORAGE_KEY, "1");
    } catch {
      // Ignore storage access errors.
    }
    return true;
  }

  return false;
}

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — VevuPay" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const [referralCount, setReferralCount] = useState(0);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isInsideAndroidWrapper, setIsInsideAndroidWrapper] =
    useState<boolean>(() => detectAndroidWrapper());

  useEffect(() => {
    if (isInsideAndroidWrapper) return;

    if (detectAndroidWrapper()) {
      setIsInsideAndroidWrapper(true);
      return;
    }

    const timer = window.setTimeout(() => {
      if (detectAndroidWrapper()) {
        setIsInsideAndroidWrapper(true);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [isInsideAndroidWrapper]);

  useEffect(() => {
    const fetchCounts = async () => {
      if (!user) return;

      try {
        const { count } = await supabase
          .from("referrals")
          .select("*", { count: "exact", head: true })
          .eq("referrer_id", user.id);

        setReferralCount(count || 0);
      } catch (err) {
        console.error(
          "Error fetching referral count:",
          err instanceof Error ? err.message : "Failed to fetch referrals",
        );
      }
    };

    fetchCounts();
  }, [user]);

  const handleGetApp = () => {
    if (!isSafeHttpsUrl(ANDROID_APK_URL)) {
      toast.error("Invalid download link.");
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = ANDROID_APK_URL;
      link.download = "vevupay.apk";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Downloading VevuPay Android app (APK)...");
    } catch {
      window.open(ANDROID_APK_URL, "_blank", "noopener,noreferrer");
    }
  };

  const handleSignOutConfirm = async () => {
    setIsLoggingOut(true);

    try {
      await signOut();
      toast.success("Signed out successfully");
      setShowLogoutConfirm(false);
      navigate({ to: "/auth", replace: true });
    } catch (e: any) {
      toast.error(e?.message || "Failed to sign out");
      setShowLogoutConfirm(false);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/profile" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <UserCircle className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">Profile</p>
              <p className="text-xs text-muted-foreground">
                View your account details
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: "/security" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Shield className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">Security</p>
              <p className="text-xs text-muted-foreground">
                Manage your password and transaction PIN
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: "/privacy" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <EyeOff className="h-5 w-5 text-indigo-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">Privacy</p>
              <p className="text-xs text-muted-foreground">
                Shake to hide balance, fake balance
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: "/referrals" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Users className="h-5 w-5 text-purple-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">Referrals</p>
              <p className="text-xs text-muted-foreground">
                {referralCount > 0
                  ? `${referralCount} friend${referralCount > 1 ? "s" : ""} referred`
                  : "Invite friends and earn rewards"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {referralCount > 0 && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full font-medium">
                {referralCount}
              </span>
            )}
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: "/coupons" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Ticket className="h-5 w-5 text-orange-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">My Coupons</p>
              <p className="text-xs text-muted-foreground">
                View your discounts and promo rewards
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={() => navigate({ to: "/help" })}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/10">
              <MessageCircle className="h-5 w-5 text-pink-500" />
            </div>
            <div className="text-left">
              <p className="font-medium">Help & Support</p>
              <p className="text-xs text-muted-foreground">
                Need help? Send us a message
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>

        <button
          type="button"
          onClick={toggle}
          className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              {theme === "dark" ? (
                <Sun className="h-5 w-5 text-yellow-500" />
              ) : (
                <Moon className="h-5 w-5 text-yellow-500" />
              )}
            </div>
            <div className="text-left">
              <p className="font-medium">Appearance</p>
              <p className="text-xs text-muted-foreground">
                {theme === "dark" ? "Dark mode" : "Light mode"} · tap to switch
              </p>
            </div>
          </div>
          <span className="text-xs text-muted-foreground capitalize">
            {theme}
          </span>
        </button>

        {/* GET ANDROID APP SECTION (BROWSER ONLY) */}
        {!isInsideAndroidWrapper && (
          <div className="surface border border-primary/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Get Android App</p>
                  <p className="text-xs text-muted-foreground">
                    Download the VevuPay APK directly to your phone
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGetApp}
                className="flex items-center gap-2.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.55)] ring-2 ring-primary/40 transition hover:scale-[1.02] hover:shadow-[0_0_26px_rgba(59,130,246,0.75)] active:scale-[0.99]"
              >
                <span>Get App</span>
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 shadow-[0_0_10px_rgba(255,255,255,0.85)]">
                  <ArrowDown className="h-3.5 w-3.5 animate-bounce text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.95)]" />
                </span>
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Android only: If prompted after downloading, allow your browser to
              install unknown apps to complete installation.
            </p>
          </div>
        )}

        {/* Legal Section */}
        <div className="pt-4 mt-4 border-t border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
            Legal
          </p>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/legal/$slug",
                  params: { slug: "privacy-policy" },
                })
              }
              className="surface p-3 w-full flex items-center justify-between hover:border-primary transition text-sm"
            >
              <span className="text-muted-foreground">Privacy Policy</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/legal/$slug",
                  params: { slug: "terms" },
                })
              }
              className="surface p-3 w-full flex items-center justify-between hover:border-primary transition text-sm"
            >
              <span className="text-muted-foreground">
                Terms of Service
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>

            <p className="text-[10px] text-muted-foreground text-center pt-2">
              VevuPay v1.0 · © {new Date().getFullYear()} · Registered in Nigeria
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="surface p-4 w-full flex items-center justify-between hover:border-destructive transition mt-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <LogOut className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-left">
              <p className="font-medium text-red-500">Log out</p>
              <p className="text-xs text-muted-foreground">
                Sign out of your account
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Footer links — added at the very bottom */}
      <div className="mt-8 mb-2 pt-4 border-t border-border/40 flex flex-col items-center gap-2">
        <a
          href="https://vevu-technologies-lilac.vercel.app/#home"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
        >
          Vevu Technologies
        </a>
        <a
          href="https://website.vevupay.name.ng/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] text-muted-foreground hover:text-primary transition-colors underline-offset-2 hover:underline"
        >
          Vevu Pay Official
        </a>
      </div>

      {/* Logout Modal */}
      {showLogoutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
            </div>

            <h2 id="logout-dialog-title" className="text-xl font-bold text-center mb-2">
              Log out?
            </h2>

            <p className="text-sm text-muted-foreground text-center mb-6">
              Are you sure you want to sign out of your VevuPay account?
              You'll need to sign in again to access your wallet.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSignOutConfirm}
                disabled={isLoggingOut}
                className="flex-1 py-2.5 rounded-lg bg-destructive text-destructive-foreground font-medium hover:bg-destructive/90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isLoggingOut ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing out...
                  </>
                ) : (
                  "Log out"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
