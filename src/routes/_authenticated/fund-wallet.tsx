// src/routes/_authenticated/fund-wallet.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Loader2,
  Building2,
  CheckCircle,
  Eye,
  EyeOff,
  CreditCard,
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  Volume2,
  VolumeX,
  Share2,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { callEdgeFunction } from "@/lib/supabase";
import { fetchWalletBalance } from "@/lib/user-data";
import { supabase } from "@/lib/supabase";
import { DepositSuccessScreen } from "@/components/DepositSuccessScreen";
import { RecentActivity } from "@/components/RecentActivity";

export const Route = createFileRoute("/_authenticated/fund-wallet")({
  head: () => ({
    meta: [{ title: "Fund wallet — VevuPay" }],
  }),
  component: FundWallet,
});

interface VirtualAccount {
  account_number: string;
  bank: string;
  account_name?: string;
}

interface FundProfile {
  virtual_account_number: string | null;
  virtual_account_bank: string | null;
  virtual_account_name: string | null;
  bvn_verified: boolean | null;
  bvn_error: string | null;
  bvn_attempted_at: string | null;
}

type FundTab = "instant" | "dva" | "verify-bvn";

const SOUND_STORAGE_KEY = "vevupay_deposit_chime_enabled";
const CREDITED_BADGE_DURATION_MS = 4000;
const BALANCE_HIGHLIGHT_DURATION_MS = 1600;

const NGN_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

function readStoredSoundPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const saved = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (saved === null) return true;
    return saved === "true";
  } catch {
    return true;
  }
}

function playDepositChime() {
  if (typeof window === "undefined") return;

  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioContextClass) return;

  try {
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const notes = [
      { freq: 1046.5, start: now, duration: 0.14 },
      { freq: 1567.98, start: now + 0.11, duration: 0.24 },
    ];

    notes.forEach(({ freq, start, duration }) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, start);

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    });

    window.setTimeout(() => {
      void ctx.close();
    }, 600);
  } catch {
    // Ignore autoplay/audio errors
  }
}

function FundWallet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showBalance, setShowBalance] = useState(() => {
    const saved = localStorage.getItem("vevupay_show_balance");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem(
      "vevupay_show_balance",
      String(showBalance)
    );
  }, [showBalance]);

  const [chimeEnabled, setChimeEnabled] = useState<boolean>(() =>
    readStoredSoundPreference(),
  );
  const [recentCredit, setRecentCredit] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [badgeEntered, setBadgeEntered] = useState(false);
  const [balanceHighlighted, setBalanceHighlighted] = useState(false);

  const creditedBadgeTimeoutRef = useRef<number | undefined>(undefined);
  const balanceHighlightTimeoutRef = useRef<number | undefined>(undefined);
  const badgeEnterRafRef = useRef<number | undefined>(undefined);
  const creditCounterRef = useRef(0);
  const previousBalanceRef = useRef<number | null>(null);
  const hasInitializedBalanceRef = useRef(false);

  const clearCreditFeedbackTimers = useCallback(() => {
    if (creditedBadgeTimeoutRef.current !== undefined) {
      window.clearTimeout(creditedBadgeTimeoutRef.current);
      creditedBadgeTimeoutRef.current = undefined;
    }
    if (balanceHighlightTimeoutRef.current !== undefined) {
      window.clearTimeout(balanceHighlightTimeoutRef.current);
      balanceHighlightTimeoutRef.current = undefined;
    }
    if (badgeEnterRafRef.current !== undefined && typeof window !== "undefined") {
      window.cancelAnimationFrame(badgeEnterRafRef.current);
      badgeEnterRafRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearCreditFeedbackTimers();
    };
  }, [clearCreditFeedbackTimers]);

  useEffect(() => {
    previousBalanceRef.current = null;
    hasInitializedBalanceRef.current = false;
    setRecentCredit(null);
    setBadgeEntered(false);
    setBalanceHighlighted(false);
    clearCreditFeedbackTimers();
  }, [user?.id, clearCreditFeedbackTimers]);

  const handleToggleChime = () => {
    setChimeEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota or privacy-mode errors
      }
      if (next) {
        playDepositChime();
      }
      return next;
    });
  };

  const { data: wallet, isLoading: isWalletLoading } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => fetchWalletBalance(user!.id),
  });

  // Subscribe to Realtime changes on public.wallets so DVA/Paystack credits sync immediately
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`fund-wallet-balance-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["wallet", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["recent-tx", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const balance = Number(wallet?.balance ?? 0);

  // Trigger toast, chime, balance highlight, and "Just Credited" badge when balance increases
  useEffect(() => {
    if (!user?.id || isWalletLoading || wallet === undefined) return;

    if (!hasInitializedBalanceRef.current) {
      hasInitializedBalanceRef.current = true;
      previousBalanceRef.current = balance;
      return;
    }

    const previousBalance = previousBalanceRef.current ?? balance;
    const delta = Number((balance - previousBalance).toFixed(2));

    if (delta > 0) {
      const formattedCredit = NGN_FORMATTER.format(delta);
      const formattedNewBalance = NGN_FORMATTER.format(balance);

      clearCreditFeedbackTimers();
      creditCounterRef.current += 1;
      setBadgeEntered(false);
      setBalanceHighlighted(true);
      setRecentCredit({
        id: creditCounterRef.current,
        label: `+${formattedCredit} Just Credited`,
      });

      if (typeof window !== "undefined") {
        badgeEnterRafRef.current = window.requestAnimationFrame(() => {
          setBadgeEntered(true);
        });
      } else {
        setBadgeEntered(true);
      }

      balanceHighlightTimeoutRef.current = window.setTimeout(() => {
        setBalanceHighlighted(false);
      }, BALANCE_HIGHLIGHT_DURATION_MS);

      creditedBadgeTimeoutRef.current = window.setTimeout(() => {
        setRecentCredit(null);
        setBadgeEntered(false);
      }, CREDITED_BADGE_DURATION_MS);

      toast.success(`Wallet funded with ${formattedCredit}`, {
        description: `New balance: ${formattedNewBalance}`,
      });

      if (chimeEnabled) {
        playDepositChime();
      }

      void queryClient.invalidateQueries({ queryKey: ["recent-tx", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
    }

    previousBalanceRef.current = balance;
  }, [balance, wallet, isWalletLoading, user?.id, chimeEnabled, queryClient, clearCreditFeedbackTimers]);

  const formattedBalance = balance.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const displayBalance = showBalance
    ? `₦${formattedBalance}`
    : "₦••••••••";

  // Verify Paystack redirect reference against confirmed database record before showing success
  const [showDepositSuccess, setShowDepositSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);

  useEffect(() => {
    if (!user?.id) return;

    const params = new URLSearchParams(window.location.search);
    const reference = (params.get("reference") || params.get("trxref"))?.trim();
    if (!reference) return;

    // Clean query parameters from URL immediately
    window.history.replaceState({}, document.title, window.location.pathname);

    let cancelled = false;

    const verifyReference = async () => {
      try {
        const { data: tx, error } = await supabase
          .from("transactions")
          .select("amount, status")
          .eq("reference", reference)
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (error || !tx) {
          toast.info(
            "Confirming your payment status. If you just completed payment, please check your transactions shortly."
          );
          return;
        }

        const normalizedStatus = String(tx.status ?? "").toLowerCase();
        const confirmedAmount = Number(tx.amount);

        if (
          (normalizedStatus === "completed" ||
            normalizedStatus === "success" ||
            normalizedStatus === "successful") &&
          Number.isFinite(confirmedAmount) &&
          confirmedAmount > 0
        ) {
          setSuccessAmount(confirmedAmount);
          setShowDepositSuccess(true);
          void queryClient.invalidateQueries({ queryKey: ["wallet", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["recent-tx", user.id] });
          void queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
        } else {
          toast.info("Your deposit is still pending confirmation.");
        }
      } catch {
        if (!cancelled) {
          toast.info("Unable to confirm payment status right now. Please check your transactions.");
        }
      }
    };

    void verifyReference();

    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient]);

  const {
    data: profile,
    refetch: refetchProfile,
  } = useQuery<FundProfile | null>({
    queryKey: ["fund-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(`
          virtual_account_number,
          virtual_account_bank,
          virtual_account_name,
          bvn_verified,
          bvn_error,
          bvn_attempted_at
        `)
        .eq("id", user!.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as FundProfile | null;
    },
  });

  const bvnVerified = profile?.bvn_verified === true;

  const [createdAccount, setCreatedAccount] =
    useState<VirtualAccount | null>(null);

  const virtualAccount: VirtualAccount | null =
    profile?.virtual_account_number
      ? {
          account_number: profile.virtual_account_number,
          bank: profile.virtual_account_bank || "Wema Bank",
          account_name:
            profile.virtual_account_name || undefined,
        }
      : createdAccount;

  const hasDVA = !!virtualAccount?.account_number;

  const [tab, setTab] = useState<FundTab>("instant");

  useEffect(() => {
    if (hasDVA || bvnVerified) {
      setTab("dva");
    }
  }, [hasDVA, bvnVerified]);

  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const handleInstantPay = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!user) return;

    const amt = Number(payAmount);

    if (!amt || amt < 100) {
      toast.error("Minimum amount is ₦100");
      return;
    }

    setPaying(true);

    try {
      const res = await callEdgeFunction<{
        success: boolean;
        authorization_url: string;
      }>("initialize-payment", {
        amount: amt,
      });

      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      } else {
        throw new Error(
          "No authorization URL returned."
        );
      }
    } catch (err: any) {
      toast.error(
        err.message || "Failed to start payment."
      );
    } finally {
      setPaying(false);
    }
  };

  const [bvn, setBvn] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");

  const [banks, setBanks] = useState<
    { code: string; name: string }[]
  >([]);

  const [loadingBanks, setLoadingBanks] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadBanks = async () => {
      setLoadingBanks(true);

      try {
        const res = await callEdgeFunction<{
          status: string;
          banks: { code: string; name: string }[];
        }>("list-banks", {});

        if (!cancelled && res.banks) {
          setBanks(res.banks);
        }
      } catch (err: any) {
        if (!cancelled) {
          toast.error(
            err.message || "Failed to load banks."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingBanks(false);
        }
      }
    };

    loadBanks();

    return () => {
      cancelled = true;
    };
  }, []);

  const [creatingDva, setCreatingDva] = useState(false);
  const [dvaError, setDvaError] = useState("");

  const dvaRequestInFlight = useRef(false);
  const autoAttemptedUserId = useRef<string | null>(null);

  const requestDva = useCallback(
    async (manual = false) => {
      const userId = user?.id;

      if (!userId || hasDVA) return;

      if (dvaRequestInFlight.current) return;

      if (
        !manual &&
        autoAttemptedUserId.current === userId
      ) {
        return;
      }

      autoAttemptedUserId.current = userId;

      dvaRequestInFlight.current = true;

      setCreatingDva(true);
      setDvaError("");

      try {
        const res = await callEdgeFunction<{
          status?: string;
          message?: string;
          error?: string;
          account?: VirtualAccount;
        }>("get-virtual-account", {});

        if (
          res.status !== "success" ||
          !res.account?.account_number
        ) {
          throw new Error(
            res.message ||
              res.error ||
              "Unable to create your dedicated account."
          );
        }

        setCreatedAccount(res.account);

        const refreshed = await refetchProfile();

        if (refreshed.error) {
          console.error(
            "Profile refresh after DVA creation failed:",
            refreshed.error
          );
        }

        toast.success(
          "Your dedicated bank account is ready!"
        );

      } catch (err: any) {
        const message =
          err.message ||
          "Unable to create your dedicated account. Please try again.";

        console.error("DVA creation failed:", err);

        setDvaError(message);

        toast.error(message);

      } finally {
        dvaRequestInFlight.current = false;
        setCreatingDva(false);
      }
    },
    [user?.id, hasDVA, refetchProfile]
  );

  useEffect(() => {
    if (bvnVerified && !hasDVA) {
      void requestDva();
    }
  }, [bvnVerified, hasDVA, requestDva]);

  const handleVerify = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!user) return;

    if (bvn.length !== 11) {
      toast.error("BVN must be 11 digits.");
      return;
    }

    if (accountNumber.length !== 10) {
      toast.error(
        "Bank account number must be 10 digits."
      );
      return;
    }

    if (!bankCode) {
      toast.error("Please select your bank.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await callEdgeFunction<{
        success?: boolean;
        status?: string;
        message?: string;
        error?: string;
      }>("verify-identity", {
        bvn,
        account_number: accountNumber,
        bank_code: bankCode,
      });

      const refreshed = await refetchProfile();

      const updatedProfile = refreshed.data;

      if (res.success) {
        setTab("dva");

        if (updatedProfile?.bvn_verified === true) {
          toast.success(
            "Identity verified! Creating your dedicated account..."
          );

          if (!updatedProfile.virtual_account_number) {
            await requestDva(true);
          } else {
            toast.success(
              "Your dedicated account is already available."
            );
          }

        } else {
          toast.info(
            "Verification was successful, but your verification status has not yet updated. Please refresh shortly."
          );
        }

      } else if (res.status === "pending") {
        toast.info(
          "Verification is processing. Please wait."
        );

        setTab("dva");

        if (updatedProfile?.bvn_verified === true) {
          if (!updatedProfile.virtual_account_number) {
            await requestDva(true);
          }
        }

      } else {
        toast.error(
          res.error ||
            res.message ||
            "Verification failed. Please check your details."
        );
      }

    } catch (err: any) {
      toast.error(
        err.message || "Verification failed."
      );

      await refetchProfile();

    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (
      tab !== "dva" ||
      !bvnVerified ||
      hasDVA
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refetchProfile();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    tab,
    bvnVerified,
    hasDVA,
    refetchProfile,
  ]);

  const [copied, setCopied] = useState(false);
  const [isSharingAccount, setIsSharingAccount] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(true);

      toast.success("Account number copied!");

      setTimeout(() => {
        setCopied(false);
      }, 2000);

    } catch {
      toast.error("Unable to copy account number.");
    }
  };

  const shareVirtualAccount = async (account: VirtualAccount) => {
    if (isSharingAccount) return;

    const lines = [
      "VevuPay Funding Details",
      `Bank: ${account.bank}`,
      `Account Number: ${account.account_number}`,
    ];
    if (account.account_name) {
      lines.push(`Account Name: ${account.account_name}`);
    }
    const summary = lines.join("\n");

    setIsSharingAccount(true);
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        try {
          await navigator.share({
            title: "VevuPay Account Details",
            text: summary,
          });
          return;
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
        }
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        toast.success("Account details copied to share!");
      } else {
        toast.error("Sharing is not supported on this device.");
      }
    } catch {
      toast.error("Unable to share account details.");
    } finally {
      setIsSharingAccount(false);
    }
  };

  return (
    <div className="space-y-6">

      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">
              Fund Wallet
            </h1>

            <p className="text-sm text-muted-foreground">
              Add money to your wallet
            </p>
          </div>

          <div className="rounded-lg bg-card px-4 py-2 text-right shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-end gap-2">
              <p className="text-xs text-muted-foreground">
                Balance
              </p>

              <button
                type="button"
                onClick={handleToggleChime}
                aria-pressed={chimeEnabled}
                aria-label={chimeEnabled ? "Mute deposit chime" : "Unmute deposit chime"}
                title={chimeEnabled ? "Deposit chime on (click to mute)" : "Deposit chime muted (click to unmute)"}
                className="rounded p-0.5 hover:bg-secondary/80 text-muted-foreground"
              >
                {chimeEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() =>
                  setShowBalance(!showBalance)
                }
                aria-label={showBalance ? "Hide wallet balance" : "Show wallet balance"}
                className="rounded p-0.5 hover:bg-secondary/80"
              >
                {showBalance ? (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <p
                className={`text-xl font-bold transition-colors duration-300 ${
                  balanceHighlighted && showBalance
                    ? "text-emerald-600 dark:text-emerald-400"
                    : ""
                }`}
              >
                {displayBalance}
              </p>

              {recentCredit && (
                <span
                  key={recentCredit.id}
                  role="status"
                  aria-live="polite"
                  className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/30 transition-all duration-300 ease-out motion-reduce:transition-none dark:text-emerald-400 ${
                    badgeEntered
                      ? "translate-y-0 scale-100 opacity-100"
                      : "translate-y-1 scale-95 opacity-0"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping motion-reduce:animate-none"
                  />
                  <span>{recentCredit.label}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {hasDVA && virtualAccount && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card/80 px-3.5 py-2.5 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{virtualAccount.bank}</span>
                {virtualAccount.account_name && (
                  <span className="truncate">• {virtualAccount.account_name}</span>
                )}
              </div>
              <p className="font-mono text-sm font-bold tracking-wider text-foreground mt-0.5">
                {virtualAccount.account_number}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => void copyToClipboard(virtualAccount.account_number)}
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/70 transition"
              >
                {copied ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => void shareVirtualAccount(virtualAccount)}
                disabled={isSharingAccount}
                className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary/70 transition disabled:opacity-50"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>{isSharingAccount ? "Sharing..." : "Share"}</span>
              </button>

              {tab !== "dva" && (
                <button
                  type="button"
                  onClick={() => setTab("dva")}
                  className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                >
                  Details
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2">

        <button
          onClick={() => setTab("instant")}
          className={`p-3 rounded-xl border transition ${
            tab === "instant"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/40"
          }`}
        >
          <CreditCard
            className={`h-5 w-5 mb-1 mx-auto ${
              tab === "instant"
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          />

          <p className="text-sm font-semibold">
            Instant Pay
          </p>

          <p className="text-[10px] text-muted-foreground">
            Card, USSD, bank
          </p>
        </button>

        <button
          onClick={() =>
            setTab(
              hasDVA || bvnVerified
                ? "dva"
                : "verify-bvn"
            )
          }
          className={`p-3 rounded-xl border transition ${
            tab === "dva" || tab === "verify-bvn"
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/40"
          }`}
        >
          <Building2
            className={`h-5 w-5 mb-1 mx-auto ${
              tab === "dva" || tab === "verify-bvn"
                ? "text-primary"
                : "text-muted-foreground"
            }`}
          />

          <p className="text-sm font-semibold">
            Bank Transfer
          </p>

          <p className="text-[10px] text-muted-foreground">
            Dedicated account
          </p>
        </button>

      </div>

      {tab === "instant" && (
        <div className="card-elevated p-5 space-y-4">

          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />

            <h2 className="font-semibold">
              Instant Payment
            </h2>
          </div>

          <p className="text-xs text-muted-foreground">
            Fund instantly using your debit card,
            bank transfer, or USSD.
          </p>

          <form
            onSubmit={handleInstantPay}
            className="space-y-3"
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Amount (₦)
              </label>

              <input
                type="number"
                inputMode="numeric"
                value={payAmount}
                onChange={(e) =>
                  setPayAmount(e.target.value)
                }
                placeholder="1000"
                className="input-field text-lg font-semibold"
                min={100}
                required
              />

              <p className="text-[11px] text-muted-foreground mt-1">
                Minimum ₦100
              </p>
            </div>

            <button
              type="submit"
              disabled={paying}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2"
            >
              {paying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  Continue to Payment
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

        </div>
      )}

      {tab === "verify-bvn" && (
        <div className="card-elevated p-5 space-y-4">

          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />

            <h2 className="font-semibold">
              Verify Identity
            </h2>
          </div>

          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              🔒 To get a dedicated account number for
              bank transfers, we need to verify your
              identity with Paystack. This is a
              one-time process.
            </p>
          </div>

          {profile?.bvn_error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 flex items-start gap-2">

              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />

              <div>
                <p className="text-xs font-semibold text-destructive">
                  Previous attempt failed
                </p>

                <p className="text-xs text-destructive/80 mt-0.5">
                  {profile.bvn_error}
                </p>
              </div>

            </div>
          )}

          <form
            onSubmit={handleVerify}
            className="space-y-3"
          >

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                BVN
              </label>

              <input
                type="text"
                inputMode="numeric"
                maxLength={11}
                value={bvn}
                onChange={(e) =>
                  setBvn(
                    e.target.value.replace(/\D/g, "")
                  )
                }
                placeholder="Enter 11-digit BVN"
                className="input-field font-mono"
                required
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Bank Account Number
              </label>

              <input
                type="text"
                inputMode="numeric"
                maxLength={10}
                value={accountNumber}
                onChange={(e) =>
                  setAccountNumber(
                    e.target.value.replace(/\D/g, "")
                  )
                }
                placeholder="Enter 10-digit account number"
                className="input-field font-mono"
                required
              />

              <p className="text-[11px] text-muted-foreground mt-1">
                Account must be linked to this BVN.
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Bank
              </label>

              <select
                value={bankCode}
                onChange={(e) =>
                  setBankCode(e.target.value)
                }
                className="input-field"
                required
                disabled={loadingBanks}
              >
                <option value="">
                  {loadingBanks
                    ? "Loading banks..."
                    : "Select your bank"}
                </option>

                {banks.map((b) => (
                  <option
                    key={b.code}
                    value={b.code}
                  >
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-[11px] text-muted-foreground">
                🔒 Your BVN is sent directly to Paystack
                for verification. We never store your BVN.
                Only the verification result is saved.
              </p>
            </div>

            <button
              type="submit"
              disabled={
                submitting ||
                bvn.length !== 11 ||
                accountNumber.length !== 10 ||
                !bankCode ||
                loadingBanks
              }
              className="btn-primary w-full py-3 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Verify & Get Account Number
                </>
              )}
            </button>

          </form>

        </div>
      )}

      {tab === "dva" && (
        <div className="card-elevated p-5 space-y-4">

          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />

            <h2 className="font-semibold">
              Bank Transfer
            </h2>
          </div>

          {hasDVA && virtualAccount && (
            <div className="rounded-xl bg-secondary/50 p-4">

              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {virtualAccount.bank}
              </p>

              <p className="mt-1 font-mono text-2xl font-bold tracking-wider">
                {virtualAccount.account_number}
              </p>

              {virtualAccount.account_name && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {virtualAccount.account_name}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">

                <div className="flex items-center gap-2 rounded-lg bg-success/10 p-2 text-xs text-success">
                  <CheckCircle className="h-3.5 w-3.5" />

                  <span>
                    Credited automatically
                  </span>
                </div>

                <button
                  onClick={() =>
                    copyToClipboard(
                      virtualAccount.account_number
                    )
                  }
                  className="rounded-lg p-2 hover:bg-secondary"
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>

              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Transfer from any Nigerian bank to this
                account. Your wallet will be credited
                automatically after a successful deposit.
              </p>

            </div>
          )}

          {!hasDVA && bvnVerified && (
            <div className="text-center py-6">

              <div className="inline-flex p-3 rounded-full bg-green-500/10 mb-3">
                <ShieldCheck className="h-6 w-6 text-green-500" />
              </div>

              <p className="text-sm font-semibold">
                Identity verified!
              </p>

              {creatingDva ? (
                <>
                  <p className="text-xs text-muted-foreground mt-2">
                    We're creating your dedicated
                    account. Please wait.
                  </p>

                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />

                    <span className="text-xs text-muted-foreground">
                      Setting up your account...
                    </span>
                  </div>
                </>
              ) : dvaError ? (
                <>
                  <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-left flex items-start gap-2">

                    <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />

                    <p className="text-xs text-destructive">
                      {dvaError}
                    </p>

                  </div>

                  <button
                    onClick={() => void requestDva(true)}
                    className="btn-primary mt-4 px-6 py-2.5 inline-flex items-center justify-center gap-2"
                  >
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mt-2">
                    Your identity is verified. Your
                    dedicated account is ready to be
                    created.
                  </p>

                  <button
                    onClick={() => void requestDva(true)}
                    className="btn-primary mt-4 px-6 py-2.5 inline-flex items-center justify-center gap-2"
                  >
                    Create Dedicated Account
                  </button>
                </>
              )}

              <button
                onClick={() => void refetchProfile()}
                className="mt-4 block mx-auto text-xs text-primary hover:underline"
              >
                Refresh Account Status
              </button>

            </div>
          )}

          {!hasDVA && !bvnVerified && (
            <div className="text-center py-6">

              <div className="inline-flex p-3 rounded-full bg-primary/10 mb-3">
                <Building2 className="h-6 w-6 text-primary" />
              </div>

              <p className="text-sm font-semibold">
                Get your dedicated account
              </p>

              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Verify your identity to get a permanent
                bank account number for instant transfers.
              </p>

              <button
                onClick={() => setTab("verify-bvn")}
                className="btn-primary px-6 py-2.5 inline-flex items-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Verify Identity
              </button>

            </div>
          )}

        </div>
      )}

      {/* LIVE RECENT ACTIVITY */}
      <RecentActivity userId={user?.id} limit={5} />

      {/* FOOTER */}
      <div className="space-y-2">
        <div className="rounded-lg bg-secondary/30 p-3 text-center text-xs text-muted-foreground">
          💳 No fees for deposits. Your wallet is credited
          automatically after payment.
        </div>

        {/* Paystack Trust Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-1">
          <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
          <span>Wallet funding securely encrypted and processed by Paystack</span>
        </div>
      </div>

      {/* Deposit Success Screen Modal */}
      <DepositSuccessScreen
        isOpen={showDepositSuccess}
        amount={successAmount}
        onClose={() => {
          setShowDepositSuccess(false);
          navigate({ to: "/transactions" });
        }}
      />

    </div>
  );
}
