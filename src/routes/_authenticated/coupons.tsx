// src/routes/_authenticated/coupons.tsx

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Ticket,
  Clock,
  Calendar,
  Tag,
  Percent,
  Info,
  Gift,
  ShieldAlert,
  Copy,
  Check,
  Sparkles,
  ArrowUpRight,
  Wallet,
  TrendingDown,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

import {
  fetchUserCoupons,
  isActiveCoupon,
  type UserCoupon,
} from "@/lib/user-data";

export const Route = createFileRoute("/_authenticated/coupons")({
  head: () => ({
    meta: [{ title: "My Coupons — VevuPay" }],
  }),
  component: CouponsPage,
});

type Coupon = UserCoupon & {
  remaining_balance?: number | null;
};

type PurchaseRoute =
  | "/purchase/airtime"
  | "/purchase/data"
  | "/purchase/tv"
  | "/purchase/electricity"
  | "/purchase/bet"
  | "/purchase/education";

const SERVICE_LABELS: Record<
  string,
  { label: string; route?: PurchaseRoute }
> = {
  all: {
    label:
      "All Purchases (Airtime, Data, TV, Electricity, Betting & Exam Pins)",
  },

  airtime: {
    label: "Airtime Top-up Only",
    route: "/purchase/airtime",
  },

  data: {
    label: "Data Bundles Only",
    route: "/purchase/data",
  },

  tv: {
    label: "Cable TV Only",
    route: "/purchase/tv",
  },

  electricity: {
    label: "Electricity Bills Only",
    route: "/purchase/electricity",
  },

  bet: {
    label: "Betting Wallet Only",
    route: "/purchase/bet",
  },

  education: {
    label: "Exam Pins Only",
    route: "/purchase/education",
  },
};

const formatNaira = (value: number) =>
  `₦${Math.max(0, value).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;

function getRemainingBalance(coupon: Coupon): number {
  const originalValue = Math.max(
    0,
    Number(coupon.discount_value || 0),
  );

  if (coupon.discount_type !== "fixed") return 0;

  // Older records without a stored balance retain their original display.
  if (
    coupon.remaining_balance === null ||
    coupon.remaining_balance === undefined
  ) {
    return originalValue;
  }

  return Math.max(0, Number(coupon.remaining_balance));
}

function isExhaustedCoupon(coupon: Coupon): boolean {
  return (
    coupon.discount_type === "fixed" &&
    coupon.remaining_balance !== null &&
    coupon.remaining_balance !== undefined &&
    Number(coupon.remaining_balance) <= 0
  );
}

function getValidityMeta(coupon: Coupon, nowMs: number) {
  if (isExhaustedCoupon(coupon)) {
    return {
      statusLabel: "Exhausted",
      validityText: "Your coupon balance has been fully used",
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  if (coupon.is_used) {
    return {
      statusLabel: "Used",
      validityText: coupon.used_at
        ? `Redeemed on ${new Date(
            coupon.used_at,
          ).toLocaleDateString("en-NG", {
            dateStyle: "medium",
          })}`
        : "Already redeemed",
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  if (!coupon.expires_at) {
    return {
      statusLabel: coupon.is_active ? "Valid" : "Inactive",
      validityText: coupon.is_active
        ? "No expiry date set"
        : "Currently inactive",
      isExpired: false,
      isExpiringSoon: false,
    };
  }

  const expiryMs = new Date(coupon.expires_at).getTime();

  const formattedDate = new Date(expiryMs).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (expiryMs <= nowMs) {
    return {
      statusLabel: "Expired",
      validityText: `Expired on ${formattedDate}`,
      isExpired: true,
      isExpiringSoon: false,
    };
  }

  const diffHours = Math.max(
    1,
    Math.ceil((expiryMs - nowMs) / (1000 * 60 * 60)),
  );

  const diffDays = Math.floor(diffHours / 24);

  const remainingLabel =
    diffDays >= 1
      ? `Valid for ${diffDays} ${
          diffDays === 1 ? "day" : "days"
        } (until ${formattedDate})`
      : `Expires in ${diffHours} ${
          diffHours === 1 ? "hour" : "hours"
        } (${formattedDate})`;

  return {
    statusLabel: coupon.is_active ? "Valid" : "Inactive",
    validityText: remainingLabel,
    isExpired: false,
    isExpiringSoon: diffHours <= 48,
  };
}

function CouponsPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  const [activeTab, setActiveTab] = useState<
    "active" | "used" | "expired"
  >("active");

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const loadCoupons = useCallback(
    async (showLoader = false) => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }

      try {
        const formattedCoupons = await fetchUserCoupons(user.id);

        // Fetch actual remaining balances separately.
        // Always use user_coupons.remaining_balance rather than
        // the original coupons.discount_value.

        const { data: balanceRows, error: balanceError } =
          await supabase
            .from("user_coupons")
            .select("id, remaining_balance")
            .eq("user_id", user.id);

        if (balanceError) {
          throw balanceError;
        }

        const balanceMap = new Map(
          (balanceRows || []).map((row) => [
            row.id,
            row.remaining_balance,
          ]),
        );

        const updatedCoupons: Coupon[] = formattedCoupons.map(
          (coupon) => ({
            ...coupon,
            remaining_balance: balanceMap.has(coupon.id)
              ? balanceMap.get(coupon.id)
              : null,
          }),
        );

        setCoupons(updatedCoupons);
      } catch (err) {
        console.error("Error fetching coupons:", err);
        toast.error("Failed to load coupons");
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  // Initial coupon loading.
  useEffect(() => {
    void loadCoupons(true);
  }, [loadCoupons]);

  // Refresh when the user returns to this screen.
  useEffect(() => {
    const handleFocus = () => {
      void loadCoupons(false);
    };

    window.addEventListener("focus", handleFocus);

    const refreshTimer = window.setInterval(() => {
      void loadCoupons(false);
    }, 30_000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(refreshTimer);
    };
  }, [loadCoupons]);

  // Update the current time every minute.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  // Organize coupons into categories.
  const bucketedCoupons = useMemo(() => {
    const active: Coupon[] = [];
    const used: Coupon[] = [];
    const expired: Coupon[] = [];

    for (const coupon of coupons) {
      const isExpired = Boolean(
        coupon.expires_at &&
          new Date(coupon.expires_at).getTime() <= nowMs,
      );

      if (coupon.is_used || isExhaustedCoupon(coupon)) {
        used.push(coupon);
      } else if (isExpired) {
        expired.push(coupon);
      } else if (coupon.is_active) {
        active.push(coupon);
      } else {
        expired.push(coupon);
      }
    }

    return {
      active,
      used,
      expired,
    };
  }, [coupons, nowMs]);

  const filteredCoupons = bucketedCoupons[activeTab];

  // Format coupon discount information.
  const getDiscountText = (coupon: Coupon) => {
    if (coupon.discount_type === "percentage") {
      return `${coupon.discount_value}% OFF`;
    }

    return `${formatNaira(
      getRemainingBalance(coupon),
    )} remaining`;
  };

  // Copy coupon code.
  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);

      setCopiedCode(code);

      toast.success(`Copied ${code}`);

      window.setTimeout(() => {
        setCopiedCode((prev) =>
          prev === code ? null : prev,
        );
      }, 2000);
    } catch {
      toast.error("Could not copy coupon code");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 space-y-5">

      {/* Page heading */}
      <div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-2">
          <Sparkles className="h-3.5 w-3.5" />
          Vevu Rewards Wallet
        </div>

        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          My Coupons
        </h1>

        <p className="text-sm text-muted-foreground mt-0.5">
          Check your remaining coupon balances, validity, eligible purchases,
          and promo codes ready for checkout.
        </p>
      </div>

      {/* Coupon notice */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
          <ShieldAlert className="h-5 w-5" />
        </div>

        <div className="space-y-1 text-xs sm:text-sm">
          <p className="font-bold text-foreground">
            Coupons cannot be used for transfers
          </p>

          <p className="text-muted-foreground leading-relaxed">
            Coupons apply only to eligible{" "}
            <strong className="text-foreground">
              VevuPay purchases
            </strong>{" "}
            before their expiry date and cannot be used for bank or wallet
            transfers.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/40 border border-border rounded-xl p-1">
        {(
          [
            {
              key: "active",
              label: "Active",
              count: bucketedCoupons.active.length,
            },
            {
              key: "used",
              label: "Used",
              count: bucketedCoupons.used.length,
            },
            {
              key: "expired",
              label: "Expired",
              count: bucketedCoupons.expired.length,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span>{tab.label}</span>

            <span className="text-xs opacity-75">
              ({tab.count})
            </span>
          </button>
        ))}
      </div>

      {/* Coupon cards */}
      {filteredCoupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 text-center py-12 px-4">
          <Ticket className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-70" />

          <h3 className="text-base font-bold text-foreground">
            No {activeTab} coupons
          </h3>

          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            {activeTab === "active"
              ? "Join active promos on your dashboard to win service coupons and apply them at checkout."
              : activeTab === "used"
                ? "You haven't exhausted or redeemed any coupons yet."
                : "None of your coupons have expired."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCoupons.map((coupon) => {
            const exhausted = isExhaustedCoupon(coupon);

            const isActive =
              !exhausted && isActiveCoupon(coupon);

            const validity = getValidityMeta(coupon, nowMs);

            const targetKey = (
              coupon.service_target || "all"
            ).toLowerCase();

            const serviceMeta = SERVICE_LABELS[targetKey] || {
              label: `${targetKey.charAt(0).toUpperCase()}${targetKey.slice(1)} Purchases Only`,
            };

            const isCopied = copiedCode === coupon.code;

            const isFixed = coupon.discount_type === "fixed";

            const originalValue = Math.max(
              0,
              Number(coupon.discount_value || 0),
            );

            const remainingBalance =
              getRemainingBalance(coupon);

            const amountUsed = Math.max(
              0,
              originalValue - remainingBalance,
            );

            const usagePercent =
              originalValue > 0
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      (amountUsed / originalValue) * 100,
                    ),
                  )
                : 0;

            return (
              <div
                key={coupon.id}
                className={`relative overflow-hidden rounded-2xl border bg-card shadow-sm transition ${
                  isActive
                    ? "border-primary/35 hover:border-primary/60"
                    : "border-border/60 opacity-80"
                }`}
              >
                {/* Coupon strip */}
                <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-[11px] font-black tracking-wider text-primary-foreground">
                      VEVU
                    </span>

                    <span className="text-xs font-semibold text-muted-foreground">
                      Purchase Coupon
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      isActive
                        ? validity.isExpiringSoon
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : exhausted || coupon.is_used
                          ? "bg-secondary text-muted-foreground"
                          : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {isActive && validity.isExpiringSoon
                      ? "Expiring Soon"
                      : validity.statusLabel}
                  </span>
                </div>

                <div className="p-4 space-y-4">

                  {/* Coupon heading */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 ${
                          isActive
                            ? "bg-primary/12 text-primary"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {coupon.discount_type === "percentage" ? (
                          <Percent className="h-5 w-5" />
                        ) : (
                          <Ticket className="h-5 w-5" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg font-extrabold tracking-tight text-foreground">
                            {getDiscountText(coupon)}
                          </span>

                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border/70">
                            {coupon.code}
                          </span>
                        </div>

                        {coupon.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {coupon.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(coupon.code)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/15 transition shrink-0"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Fixed coupon balance */}
                  {isFixed && (
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground block">
                            Remaining balance
                          </span>

                          <div className="text-2xl font-black text-primary mt-1">
                            {formatNaira(remainingBalance)}
                          </div>
                        </div>

                        <div className="rounded-xl bg-primary/10 p-3 text-primary">
                          <Wallet className="h-6 w-6" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-background/70 border border-border/60 p-2.5">
                          <span className="block text-[10px] text-muted-foreground font-semibold">
                            Original value
                          </span>

                          <span className="block text-sm font-extrabold text-foreground mt-1">
                            {formatNaira(originalValue)}
                          </span>
                        </div>

                        <div className="rounded-lg bg-background/70 border border-border/60 p-2.5">
                          <span className="block text-[10px] text-muted-foreground font-semibold">
                            Amount used
                          </span>

                          <span className="block text-sm font-extrabold text-foreground mt-1">
                            {formatNaira(amountUsed)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <TrendingDown className="h-3 w-3" />
                            Coupon usage
                          </span>

                          <span>
                            {Math.round(usagePercent)}% used
                          </span>
                        </div>

                        <div className="h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{
                              width: `${usagePercent}%`,
                            }}
                          />
                        </div>
                      </div>

                      {exhausted && (
                        <p className="text-xs font-semibold text-muted-foreground">
                          This coupon has been fully exhausted.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Percentage coupon information */}
                  {!isFixed && (
                    <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                      <p className="text-sm font-bold text-foreground">
                        {coupon.discount_value}% discount
                      </p>

                      <p className="text-xs text-muted-foreground mt-1">
                        This coupon applies a percentage discount to
                        eligible purchases. It does not have a stored
                        monetary balance.
                      </p>
                    </div>
                  )}

                  {/* Eligible purchases */}
                  <div className="rounded-xl bg-secondary/50 border border-border/60 px-3 py-2.5 flex items-center justify-between gap-2">
                    <div className="text-xs min-w-0">
                      <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground block">
                        Valid Purchases
                      </span>

                      <span className="font-semibold text-foreground">
                        {serviceMeta.label}
                      </span>
                    </div>

                    {isActive && serviceMeta.route && (
                      <Link
                        to={serviceMeta.route}
                        className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline shrink-0"
                      >
                        Use now
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>

                  {/* Validity and terms */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground pt-0.5">
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground/85">
                      {coupon.is_used || exhausted ? (
                        <Clock className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                      )}

                      {validity.validityText}
                    </span>

                    {Number(coupon.min_purchase || 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5" />
                        Min. order:{" "}
                        {formatNaira(
                          Number(coupon.min_purchase),
                        )}
                      </span>
                    )}

                    {Number(coupon.max_discount || 0) > 0 &&
                      coupon.discount_type === "percentage" && (
                        <span className="inline-flex items-center gap-1">
                          <Info className="h-3.5 w-3.5" />
                          Max cap:{" "}
                          {formatNaira(
                            Number(coupon.max_discount),
                          )}
                        </span>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How to earn coupons */}
      <div className="rounded-2xl bg-secondary/30 text-center p-5 border border-border/60">
        <Gift className="h-6 w-6 text-primary mx-auto mb-2" />

        <h3 className="text-sm font-bold text-foreground">
          How to get coupons
        </h3>

        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
          Watch the <b>Promo Banner</b> on your dashboard and compete in
          active campaigns to win service coupons straight to your account.
        </p>
      </div>
    </div>
  );
}
