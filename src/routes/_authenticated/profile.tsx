// src/routes/_authenticated/profile.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  User,
  Mail,
  Shield,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Award,
  ArrowUpCircle,
  X,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — VevuPay" }] }),
  component: ProfilePage,
});

interface TierAllowanceInfo {
  tier: number;
  tier_name: string;
  single_limit: number;
  daily_limit: number;
  next_tier: number | null;
  next_tier_name: string | null;
  tx_needed_for_next: number;
  days_needed_for_next: number;
  age_days_needed_for_next: number;
}

const DEFAULT_TIER_INFO: TierAllowanceInfo = {
  tier: 1,
  tier_name: "Starter",
  single_limit: 10000,
  daily_limit: 25000,
  next_tier: 2,
  next_tier_name: "Regular",
  tx_needed_for_next: 5,
  days_needed_for_next: 3,
  age_days_needed_for_next: 7,
};

function getDefaultTierName(tierNum: number): string {
  if (tierNum === 2) return "Regular";
  if (tierNum === 3) return "Trusted";
  return "Starter";
}

function formatNaira(value: number): string {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [tierInfo, setTierInfo] = useState<TierAllowanceInfo>(DEFAULT_TIER_INFO);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const [
          { data, error },
          { data: devs },
          { data: fnData, error: fnError },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("user_devices")
            .select("*")
            .eq("user_id", user.id)
            .order("last_used", { ascending: false }),
          supabase.functions.invoke("send-transfer", {
            body: {
              action: "allowance",
              user_id: user.id,
            },
          }),
        ]);

        if (error) {
          console.error("Profile fetch error:", error);
          toast.error(error.message || "Failed to load profile");
        } else {
          setProfile(data);
        }

        setDevices(devs || []);

        if (!fnError && fnData?.success && fnData?.allowance) {
          const raw = fnData.allowance;
          const resolvedTier = Number(raw.tier ?? data?.transfer_tier ?? 1);
          setTierInfo({
            tier: resolvedTier,
            tier_name: raw.tier_name ?? getDefaultTierName(resolvedTier),
            single_limit: Number(raw.single_limit ?? 10000),
            daily_limit: Number(raw.daily_limit ?? 25000),
            next_tier: raw.next_tier === null ? null : Number(raw.next_tier),
            next_tier_name: raw.next_tier_name ?? null,
            tx_needed_for_next: Number(raw.tx_needed_for_next ?? 0),
            days_needed_for_next: Number(raw.days_needed_for_next ?? 0),
            age_days_needed_for_next: Number(raw.age_days_needed_for_next ?? 0),
          });
        } else if (data) {
          const fallbackTier = Number(data.transfer_tier ?? 1) || 1;
          setTierInfo((prev) => ({
            ...prev,
            tier: fallbackTier,
            tier_name: getDefaultTierName(fallbackTier),
          }));
        }
      } catch (err: any) {
        console.error("Error fetching profile:", err);
        toast.error(err?.message || "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user]);

  useEffect(() => {
    if (!showUpgradeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowUpgradeModal(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showUpgradeModal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isVerified = !!profile?.is_verified;
  const currentTierLabel = tierInfo.tier_name
    ? `Tier ${tierInfo.tier} · ${tierInfo.tier_name}`
    : `Tier ${tierInfo.tier}`;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      {/* Profile Card */}
      <div className="surface p-6 mb-6 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-r from-blue-500 to-green-500 flex items-center justify-center text-white text-3xl font-bold mb-4">
          {profile?.full_name?.charAt(0)?.toUpperCase() ||
            user?.email?.charAt(0)?.toUpperCase() ||
            "U"}
        </div>

        <div className="flex items-center justify-center gap-2 mb-1">
          <h2 className="text-xl font-bold">
            {profile?.full_name || "User"}
          </h2>
          {isVerified ? (
            <span title="Verified Account">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </span>
          ) : (
            <span title="Unverified Account">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </span>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          {profile?.email || user?.email}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-primary/15 text-primary px-3.5 py-1.5 rounded-full text-xs font-bold">
            <Award className="h-3.5 w-3.5" />
            {currentTierLabel}
          </span>

          {profile?.referral_code && (
            <div className="inline-flex items-center gap-2 bg-secondary/40 px-4 py-1.5 rounded-full text-sm">
              <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-muted-foreground">
                Referral Code:
              </span>
              <span className="font-mono font-bold">
                {profile.referral_code}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Account Tier & Upgrade Card */}
      <div className="surface p-4 mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Award className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Account Tier</p>
              <p className="text-sm font-bold">{currentTierLabel}</p>
            </div>
          </div>

          <button
            onClick={() => setShowUpgradeModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95 transition whitespace-nowrap"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Upgrade
          </button>
        </div>
      </div>

      {/* Account Verification Status Box (Shown if not verified) */}
      {!isVerified && (
        <div className="surface p-4 mb-4 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Account Not Verified</p>
                <p className="text-xs text-muted-foreground">
                  Verify your email address to unlock full platform features.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate({ to: "/verify-account" })}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-95 whitespace-nowrap"
            >
              Verify Now
            </button>
          </div>
        </div>
      )}

      {/* Password Security Settings */}
      <button
        onClick={() => navigate({ to: "/security" })}
        className="surface p-4 w-full flex items-center justify-between hover:border-primary transition"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Shield className="h-5 w-5 text-blue-500" />
          </div>

          <div className="text-left">
            <p className="font-medium">Security Settings</p>
            <p className="text-xs text-muted-foreground">
              Manage your account password
            </p>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Profile Information */}
      <div className="surface p-4 mt-4">
        <div className="flex items-center gap-3 p-2">
          <User className="h-4 w-4 text-muted-foreground" />

          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Full Name
            </p>
            <p className="text-sm">
              {profile?.full_name || "Not set"}
            </p>
          </div>
        </div>

        <div className="divider-soft" />

        <div className="flex items-center gap-3 p-2">
          <Mail className="h-4 w-4 text-muted-foreground" />

          <div className="flex-1">
            <p className="text-xs text-muted-foreground">
              Email
            </p>
            <p className="text-sm">
              {profile?.email || user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Trusted Devices */}
      {devices.length > 0 && (
        <div className="surface p-4 mt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Trusted Devices
          </p>

          <div className="space-y-1">
            {devices.slice(0, 3).map((device: any) => (
              <div
                key={device.id}
                className="flex items-center justify-between text-sm py-1 border-b border-border/30"
              >
                <span className="truncate max-w-[70%]">
                  {device.device_name || "Unknown Device"}
                </span>

                <span className="text-xs text-muted-foreground">
                  {device.last_used
                    ? new Date(device.last_used).toLocaleDateString()
                    : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 p-3 rounded-lg bg-secondary/20 text-xs text-muted-foreground text-center">
        <p>
          Account created:{" "}
          {profile?.created_at
            ? new Date(profile.created_at).toLocaleDateString()
            : "N/A"}
        </p>
      </div>

      {/* How to Upgrade Tier Modal */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-card text-card-foreground border border-border shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  How Tier Upgrades Work
                </h3>
              </div>
              <button
                onClick={() => setShowUpgradeModal(false)}
                aria-label="Close upgrade guide"
                className="p-1.5 rounded-full hover:bg-secondary transition"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <div className="rounded-xl bg-primary/10 border border-primary/25 p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Current Tier</p>
                  <p className="text-base font-bold text-primary">{currentTierLabel}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Max single: <strong className="text-foreground">{formatNaira(tierInfo.single_limit)}</strong></p>
                  <p>24h limit: <strong className="text-foreground">{formatNaira(tierInfo.daily_limit)}</strong></p>
                </div>
              </div>

              {tierInfo.next_tier && tierInfo.next_tier_name ? (
                <div className="rounded-xl bg-secondary/40 border border-border p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    <span>
                      To unlock Tier {tierInfo.next_tier} ({tierInfo.next_tier_name})
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Complete <strong className="text-foreground">{tierInfo.tx_needed_for_next}</strong> more qualifying transaction(s),{" "}
                    <strong className="text-foreground">{tierInfo.days_needed_for_next}</strong> active day(s), and{" "}
                    <strong className="text-foreground">{tierInfo.age_days_needed_for_next}</strong> account age day(s).
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 p-3.5 text-xs text-emerald-400 font-semibold">
                  You are on the highest tier available.
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  3-Tier Spending Progression
                </p>
                <ul className="space-y-2 text-xs text-muted-foreground list-disc pl-4">
                  <li>
                    <span className="font-semibold text-foreground">Upgrade Through Spending:</span>{" "}
                    Your account tier advances across the 3 tiers as you complete qualifying transactions and spending activity (such as bill payments, airtime, and data purchases).
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Consistent Engagement:</span>{" "}
                    Steady, regular transaction activity progresses your tier over time rather than one-off spikes.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Anti-Gaming Rules:</span>{" "}
                    Micro-transaction farming or repetitive low-value activity does not count toward tier progression.
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-border">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-95 transition"
                >
                  Got It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
