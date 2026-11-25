import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Share2,
  Users,
  Gift,
  Loader2,
  AlertCircle,
  Sparkles,
  MessageCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";

interface Profile {
  referral_code: string;
  referral_earnings: number;
}

interface ReferredProfile {
  id: string;
  full_name: string | null;
}

interface Referral {
  id: string;
  bonus: number;
  created_at: string;
  referred_user_id: string;
  referrer_id: string;
  first_purchase_paid: boolean;
  referredProfile?: ReferredProfile;
}

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals — VevuPay" }] }),
  component: ReferralsPage,
});

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMoney(amount: number) {
  return `₦${Number(amount || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ReferralsPage() {
  const { user } = useAuth();

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("referral_code, referral_earnings")
        .eq("id", user!.id)
        .single();

      if (error) throw error;
      return data as Profile;
    },
  });

  const {
    data: referralsData,
    isLoading: referralsLoading,
    error: referralsError,
    refetch: refetchReferrals,
  } = useQuery({
    queryKey: ["referrals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: referralRows, error: referralError } = await supabase
        .from("referrals")
        .select(
          "id, bonus, created_at, referred_user_id, referrer_id, first_purchase_paid"
        )
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });

      if (referralError) throw referralError;

      const referrals = (referralRows || []) as Referral[];

      // Fetch referred users' names only. Never request their email addresses.
      const referredUserIds = [
        ...new Set(
          referrals
            .map((referral) => referral.referred_user_id)
            .filter(Boolean)
        ),
      ];

      let referredProfiles: ReferredProfile[] = [];

      if (referredUserIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", referredUserIds);

        if (profilesError) throw profilesError;

        referredProfiles = (profiles || []) as ReferredProfile[];
      }

      const profileMap = new Map(
        referredProfiles.map((item) => [item.id, item])
      );

      const referralsWithProfiles = referrals.map((referral) => ({
        ...referral,
        referredProfile: profileMap.get(referral.referred_user_id),
      }));

      const pending = referralsWithProfiles.filter(
        (referral) => !referral.first_purchase_paid
      );

      const paid = referralsWithProfiles.filter(
        (referral) => referral.first_purchase_paid
      );

      return {
        all: referralsWithProfiles,
        totalCount: referralsWithProfiles.length,
        pendingCount: pending.length,
        paidCount: paid.length,
      };
    },
  });

  const code = profile?.referral_code || "—";

  const link =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth?ref=${code}`
      : "";

  const allReferrals = referralsData?.all ?? [];

  // Only the two newest referrals appear on the main screen.
  const recentReferrals = allReferrals.slice(0, 2);

  const totalReferrals = referralsData?.totalCount ?? 0;
  const pendingCount = referralsData?.pendingCount ?? 0;
  const paidCount = referralsData?.paidCount ?? 0;

  const showViewAll = totalReferrals > 2;

  const isLoading = profileLoading || referralsLoading;
  const hasError = profileError || referralsError;

  const getShareMessage = () =>
    `🎉 Join me on VevuPay!

🎁 Get a ₦30 signup bonus when you register.
✨ Enjoy 5% cashback on your first qualifying purchase of ₦200 or more.

Use my referral code: ${code}

Sign up here: ${link}`;

  const share = async () => {
    if (!profile?.referral_code) return;

    const messageText = getShareMessage();

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join VevuPay",
          text: messageText,
        });
      } catch {
        // The user may have cancelled sharing.
      }
    } else {
      await copy(messageText, "Invite message copied!");
    }
  };

  const shareViaWhatsApp = () => {
    if (!profile?.referral_code) return;

    const messageText = getShareMessage();

    window.open(
      `https://wa.me/?text=${encodeURIComponent(messageText)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  const copy = async (text: string, message = "Copied!") => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Unable to copy. Please try again.");
    }
  };

  const refreshData = async () => {
    toast.info("Refreshing referrals...");

    await Promise.all([refetchProfile(), refetchReferrals()]);

    toast.success("Referral information updated.");
  };

  // Loading state.
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader
          eyebrow="Rewards"
          title="Refer & earn"
          subtitle="Invite friends. Earn rewards when they transact."
        />

        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">
            Loading referrals...
          </span>
        </div>
      </div>
    );
  }

  // Error state.
  if (hasError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <PageHeader
          eyebrow="Rewards"
          title="Refer & earn"
          subtitle="Invite friends. Earn rewards when they transact."
        />

        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-destructive" />

          <h3 className="text-lg font-semibold text-destructive">
            Failed to load referrals
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            Please refresh the page or try again later.
          </p>

          <button
            onClick={refreshData}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <PageHeader
        eyebrow="Rewards"
        title="Refer & earn"
        subtitle="Invite friends. Track your referrals and earn rewards."
      />

      {/* Referral code card */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="relative bg-gradient-to-r from-blue-500 via-cyan-500 to-green-500 p-6 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />

          <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/20 blur-2xl" />

          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-90">
            Your referral code
          </p>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-4xl font-bold tracking-[0.25em] sm:text-5xl">
              {code}
            </p>

            <button
              onClick={() => copy(code)}
              className="rounded-full bg-white/20 p-3 backdrop-blur transition hover:bg-white/30"
              aria-label="Copy referral code"
            >
              <Copy className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={share}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow transition hover:bg-white/90"
            >
              <Share2 className="h-4 w-4" />
              Share invite
            </button>

            <button
              onClick={() => copy(link, "Referral link copied!")}
              className="inline-flex items-center gap-2 rounded-full bg-black/20 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:bg-black/30"
            >
              <Copy className="h-4 w-4" />
              Copy link
            </button>

            <button
              onClick={shareViaWhatsApp}
              className="inline-flex items-center gap-2 rounded-full bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-green-600"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>
        </div>
      </div>

      {/* Referral statistics */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5 sm:text-left">
          <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground sm:flex-row sm:justify-start">
            <Users className="h-4 w-4" />
            <p className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]">
              Total
            </p>
          </div>

          <p className="mt-1 text-2xl font-bold text-primary">
            {totalReferrals}
          </p>

          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
            Registered referrals
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5 sm:text-left">
          <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground sm:flex-row sm:justify-start">
            <Clock className="h-4 w-4 text-yellow-500" />
            <p className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]">
              Pending
            </p>
          </div>

          <p className="mt-1 text-2xl font-bold text-yellow-500">
            {pendingCount}
          </p>

          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
            Awaiting purchase
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-3 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-5 sm:text-left">
          <div className="flex flex-col items-center justify-center gap-1.5 text-muted-foreground sm:flex-row sm:justify-start">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <p className="text-[10px] font-semibold uppercase tracking-wider sm:text-[11px]">
              Paid
            </p>
          </div>

          <p className="mt-1 text-2xl font-bold text-green-500">
            {paidCount}
          </p>

          <p className="mt-1 hidden text-xs text-muted-foreground sm:block">
            Rewards earned
          </p>
        </div>
      </div>

      {/* Earnings summary */}
      <div className="rounded-xl border border-green-500/20 bg-gradient-to-r from-green-500/10 to-emerald-500/10 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total referral earnings
            </p>

            <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
              {formatMoney(profile?.referral_earnings || 0)}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Rewards actually earned from qualifying referrals.
            </p>
          </div>

          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-green-500/10">
            <Gift className="h-6 w-6 text-green-500" />
          </div>
        </div>
      </div>

      {/* Reward information */}
      <div className="rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-6">
        <Gift className="mx-auto mb-2 h-12 w-12 text-yellow-500" />

        <h2 className="text-center text-xl font-bold">
          Refer & Earn Rewards
        </h2>

        <div className="mx-auto mt-3 max-w-sm space-y-2 text-left text-sm">
          <p>
            🎁 <strong>₦30 signup bonus</strong> for every new user who
            successfully registers.
          </p>

          <p>
            💰 <strong>₦50 referral reward</strong> for you when your referred
            friend completes their first successful purchase of ₦200 or more.
          </p>

          <p>
            ✨ <strong>5% cashback</strong> for your friend on their qualifying
            first purchase, subject to the existing cashback rules.
          </p>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Your ₦50 referral reward remains pending until your friend completes
          the qualifying purchase.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-yellow-500" />
          How It Works
        </h2>

        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              n: "1",
              t: "Share your code",
              d: "Send your unique referral code to friends and family.",
            },
            {
              n: "2",
              t: "They register",
              d: "Their registration immediately appears in your referral list.",
            },
            {
              n: "3",
              t: "They make a purchase",
              d: "After their first successful purchase of ₦200 or more, your ₦50 reward is paid.",
            },
          ].map((step) => (
            <li
              key={step.n}
              className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/30"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-green-500 text-sm font-bold text-white">
                {step.n}
              </span>

              <div>
                <p className="text-sm font-semibold">{step.t}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {step.d}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          Referral rewards are credited according to the existing VevuPay
          cashback and reward rules.
        </p>
      </div>

      {/* Recent referrals */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Users className="h-4 w-4 text-primary" />
              Recent Referrals
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Your two most recently registered referrals.
            </p>
          </div>

          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            {totalReferrals}
          </span>
        </div>

        {recentReferrals.length > 0 ? (
          <ul className="space-y-3">
            {recentReferrals.map((referral) => {
              const isPaid = referral.first_purchase_paid;

              // Never display referred users' email addresses.
              const referredName =
                referral.referredProfile?.full_name?.trim() ||
                "VevuPay User";

              const initial = referredName.charAt(0).toUpperCase();

              return (
                <li
                  key={referral.id}
                  className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${
                          isPaid
                            ? "bg-gradient-to-br from-green-500 to-emerald-600"
                            : "bg-gradient-to-br from-yellow-500 to-orange-500"
                        }`}
                      >
                        {initial}
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {referredName}
                        </p>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Registered {formatDate(referral.created_at)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                        isPaid
                          ? "bg-green-500/10 text-green-600 dark:text-green-400"
                          : "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
                      }`}
                    >
                      {isPaid ? "✓ Paid" : "● Pending"}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-700">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {isPaid ? "Reward earned" : "Expected reward"}
                      </p>

                      <p
                        className={`mt-1 text-sm font-bold ${
                          isPaid
                            ? "text-green-500"
                            : "text-yellow-600 dark:text-yellow-400"
                        }`}
                      >
                        {formatMoney(referral.bonus || 50)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Qualification
                      </p>

                      <p className="mt-1 text-xs font-medium">
                        {isPaid
                          ? "Purchase completed"
                          : "Awaiting purchase ≥ ₦200"}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
            <Gift className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />

            <p className="text-sm font-semibold">No referrals yet</p>

            <p className="mt-1 text-xs text-muted-foreground">
              Share your referral code and your invited friends will appear
              here as soon as they register.
            </p>

            <button
              onClick={share}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <Share2 className="h-4 w-4" />
              Share now
            </button>
          </div>
        )}

        {/* View All appears only when there are more than two referrals. */}
        {showViewAll && (
          <Link
            to="/referrals/all"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10"
          >
            View All {totalReferrals} Referrals
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </section>

      {/* Refresh */}
      {allReferrals.length > 0 && (
        <button
          onClick={refreshData}
          className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-muted-foreground transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        >
          Refresh referral information
        </button>
      )}
    </div>
  );
}
