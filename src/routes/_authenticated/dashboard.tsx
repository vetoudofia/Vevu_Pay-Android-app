// src/routes/_authenticated/dashboard.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  Wifi,
  Tv,
  Zap,
  Dice6,
  Send,
  Plus,
  Eye,
  EyeOff,
  Grid3x3,
  Copy,
  Check,
  Gift,
  PiggyBank,
  ChevronRight,
  Wallet,
  Volume2,
  VolumeX,
  Building2,
  Share2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchWalletBalance } from "@/lib/user-data";
import { useAuth } from "@/hooks/use-auth";
import { invalidateAfterPurchase } from "@/lib/query-invalidations";
import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { useShakeToHide } from "@/hooks/useShakeToHide";
import { PromoWidget } from "@/components/PromoWidget";
import { RecentActivity } from "@/components/RecentActivity";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VevuPay" }] }),
  component: Dashboard,
});

const coreServices = [
  { name: "Airtime", serviceSlug: "airtime", icon: CreditCard, tint: "from-blue-600/30 via-cyan-500/20 to-blue-900/40 border-blue-500/30 text-cyan-400" },
  { name: "Data", serviceSlug: "data", icon: Wifi, tint: "from-cyan-600/30 via-emerald-500/20 to-teal-900/40 border-cyan-500/30 text-teal-400" },
  { name: "Cable TV", serviceSlug: "tv", icon: Tv, tint: "from-purple-600/30 via-blue-500/20 to-indigo-900/40 border-purple-500/30 text-purple-400" },
  { name: "Electricity", serviceSlug: "electricity", icon: Zap, tint: "from-amber-600/30 via-orange-500/20 to-amber-950/40 border-amber-500/30 text-amber-400" },
  { name: "Betting", serviceSlug: "bet", icon: Dice6, tint: "from-fuchsia-600/30 via-pink-500/20 to-purple-950/40 border-fuchsia-500/30 text-pink-400" },
] as const;

const SOUND_STORAGE_KEY = "vevupay_deposit_chime_enabled";
const CREDITED_BADGE_DURATION_MS = 4000;
const BALANCE_HIGHLIGHT_DURATION_MS = 1600;

const NGN_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

interface ParsedPrivacySettings {
  hideTransactions: boolean;
  shakeEnabled: boolean;
  fakeBalance: number;
}

interface DashboardWalletProfile {
  virtual_account_number: string | null;
  virtual_account_bank: string | null;
  virtual_account_name: string | null;
}

function readPrivacySettings(): ParsedPrivacySettings {
  const fallback: ParsedPrivacySettings = {
    hideTransactions: false,
    shakeEnabled: false,
    fakeBalance: 8250,
  };
  try {
    const saved = localStorage.getItem("vevupay_privacy_settings");
    if (!saved) return fallback;
    const parsed = JSON.parse(saved);
    const fakeNum = Number(parsed?.fakeBalance);
    return {
      hideTransactions: Boolean(parsed?.hideTransactions),
      shakeEnabled: Boolean(parsed?.shakeEnabled),
      fakeBalance: Number.isFinite(fakeNum) && fakeNum >= 0 ? fakeNum : 8250,
    };
  } catch {
    return fallback;
  }
}

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

function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, vevu_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: accountProfile } = useQuery<DashboardWalletProfile | null>({
    queryKey: ["fund-profile", user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("virtual_account_number, virtual_account_bank, virtual_account_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as DashboardWalletProfile | null) ?? null;
    },
  });

  const vevuId = profile?.vevu_id || user?.user_metadata?.vevu_id || "Not set";
  const virtualAccountNumber = accountProfile?.virtual_account_number?.trim() || null;
  const virtualAccountBank = accountProfile?.virtual_account_bank?.trim() || "Bank";
  const virtualAccountName = accountProfile?.virtual_account_name?.trim() || null;

  const [hideRecentTx, setHideRecentTx] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [isSharingAccount, setIsSharingAccount] = useState(false);
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(() =>
    readStoredSoundPreference(),
  );
  const [recentCredit, setRecentCredit] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [badgeEntered, setBadgeEntered] = useState(false);
  const [balanceHighlighted, setBalanceHighlighted] = useState(false);

  const copyTimerRef = useRef<number | undefined>(undefined);
  const accountCopyTimerRef = useRef<number | undefined>(undefined);
  const cooldownTimerRef = useRef<number | undefined>(undefined);
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

  const loadPrivacySettings = useCallback(() => {
    const settings = readPrivacySettings();
    setHideRecentTx(settings.hideTransactions);
    setFakeBalanceAmount(settings.fakeBalance);
  }, []);

  useEffect(() => {
    loadPrivacySettings();
    window.addEventListener("focus", loadPrivacySettings);
    return () => {
      window.removeEventListener("focus", loadPrivacySettings);
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      if (accountCopyTimerRef.current !== undefined) window.clearTimeout(accountCopyTimerRef.current);
      if (cooldownTimerRef.current !== undefined) window.clearTimeout(cooldownTimerRef.current);
      clearCreditFeedbackTimers();
    };
  }, [loadPrivacySettings, clearCreditFeedbackTimers]);

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

  const copyVevuId = () => {
    if (vevuId && vevuId !== "Not set") {
      void navigator.clipboard.writeText(vevuId);
      setCopied(true);
      toast.success("Vevu ID copied!");
      if (copyTimerRef.current !== undefined) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("No Vevu ID set");
    }
  };

  const copyVirtualAccount = async () => {
    if (!virtualAccountNumber) return;
    try {
      await navigator.clipboard.writeText(virtualAccountNumber);
      setCopiedAccount(true);
      toast.success("Account number copied!", {
        description: `${virtualAccountBank} • ${virtualAccountNumber}`,
      });
      if (accountCopyTimerRef.current !== undefined) {
        window.clearTimeout(accountCopyTimerRef.current);
      }
      accountCopyTimerRef.current = window.setTimeout(() => {
        setCopiedAccount(false);
      }, 2000);
    } catch {
      toast.error("Unable to copy account number");
    }
  };

  const shareVirtualAccount = async () => {
    if (!virtualAccountNumber || isSharingAccount) return;

    const lines = [
      "VevuPay Account Details",
      `Bank: ${virtualAccountBank}`,
      `Account Number: ${virtualAccountNumber}`,
    ];
    if (virtualAccountName) {
      lines.push(`Account Name: ${virtualAccountName}`);
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
        toast.error("Sharing is not supported on this device");
      }
    } catch {
      toast.error("Unable to share account details");
    } finally {
      setIsSharingAccount(false);
    }
  };

  const [showBalance, setShowBalance] = useState(() => {
    const saved = localStorage.getItem("vevupay_show_balance");
    return saved !== null ? saved === "true" : true;
  });

  useEffect(() => {
    localStorage.setItem("vevupay_show_balance", String(showBalance));
  }, [showBalance]);

  const toggleBalance = () => setShowBalance((prev) => !prev);

  const [isFakeBalance, setIsFakeBalance] = useState(false);
  const [fakeBalanceAmount, setFakeBalanceAmount] = useState(8250);
  const toggleCooldown = useRef(false);

  useEffect(() => {
    setIsFakeBalance(false);
    setCopied(false);
    setCopiedAccount(false);
    previousBalanceRef.current = null;
    hasInitializedBalanceRef.current = false;
    setRecentCredit(null);
    setBadgeEntered(false);
    setBalanceHighlighted(false);
    clearCreditFeedbackTimers();
  }, [user?.id, clearCreditFeedbackTimers]);

  const showFakeBalance = useCallback(() => {
    if (toggleCooldown.current) return;
    toggleCooldown.current = true;
    const settings = readPrivacySettings();
    if (!settings.shakeEnabled) {
      toast.info("Enable Shake to Hide in Settings first");
      toggleCooldown.current = false;
      return;
    }
    setFakeBalanceAmount(settings.fakeBalance);
    setIsFakeBalance(true);
    if (cooldownTimerRef.current !== undefined) window.clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setTimeout(() => {
      toggleCooldown.current = false;
    }, 500);
  }, []);

  useShakeToHide(showFakeBalance, { threshold: 20, timeout: 1500 });
  const handleBalanceTap = () => setIsFakeBalance(false);

  const { data: wallet, isLoading: isWalletLoading } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    queryFn: () => fetchWalletBalance(user!.id),
  });

  // Subscribe to Realtime updates on public.wallets so deposits & promo payouts refresh wallet, activity, and promo progress
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`dashboard-wallet-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void invalidateAfterPurchase(queryClient, user.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const balance = Number(wallet?.balance ?? 0);
  const cashbackBalance = Number(wallet?.cashback_balance ?? 0);
  const isZeroBalance = !isWalletLoading && wallet !== undefined && balance <= 0;
  const isTransferDisabled = isWalletLoading || balance <= 0;

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
    }

    previousBalanceRef.current = balance;
  }, [balance, wallet, isWalletLoading, user?.id, chimeEnabled, clearCreditFeedbackTimers]);

  const formattedBalance = balance.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formattedCashback = cashbackBalance.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let displayBalance;
  if (isFakeBalance) displayBalance = `₦${fakeBalanceAmount.toLocaleString()}`;
  else if (showBalance) displayBalance = `₦${formattedBalance}`;
  else displayBalance = "₦••••••••";

  return (
    <div className="space-y-6 pb-12">
      {/* WALLET BALANCE CARD (Neon glow rim, dark glass layout, floating card icon) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 text-slate-100 border border-cyan-500/30 shadow-[0_0_40px_rgba(25,197,194,0.12)]">
        <div className="absolute -right-8 -top-8 h-48 w-48 rounded-full bg-gradient-to-br from-teal-500/20 to-cyan-500/0 blur-3xl pointer-events-none" />
        <div className="absolute right-4 top-6 opacity-20 pointer-events-none">
          <Wallet className="h-28 w-28 text-cyan-400" />
        </div>

        <div className="flex items-center justify-between relative z-10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Wallet balance</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleChime}
              aria-pressed={chimeEnabled}
              aria-label={chimeEnabled ? "Mute deposit chime" : "Unmute deposit chime"}
              title={chimeEnabled ? "Deposit chime on (click to mute)" : "Deposit chime muted (click to unmute)"}
              className="rounded-full bg-slate-800/80 border border-slate-700/50 p-2 backdrop-blur transition hover:bg-slate-800 text-slate-300"
            >
              {chimeEnabled ? <Volume2 className="h-4 w-4 text-cyan-300" /> : <VolumeX className="h-4 w-4 text-slate-400" />}
            </button>

            <button
              type="button"
              onClick={toggleBalance}
              aria-label={showBalance ? "Hide wallet balance" : "Show wallet balance"}
              className="rounded-full bg-slate-800/80 border border-slate-700/50 p-2 backdrop-blur transition hover:bg-slate-800 text-slate-300"
            >
              {showBalance ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <p
              className={`text-3xl sm:text-4xl font-extrabold tracking-tight transition-all duration-300 cursor-pointer hover:opacity-80 ${
                balanceHighlighted && showBalance && !isFakeBalance
                  ? "text-emerald-400"
                  : "text-white"
              } ${!showBalance && !isFakeBalance ? "blur-sm opacity-60" : ""}`}
              onClick={handleBalanceTap}
            >
              {displayBalance}
            </p>

            {recentCredit && (
              <span
                key={recentCredit.id}
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-400/35 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  badgeEntered
                    ? "translate-y-0 scale-100 opacity-100"
                    : "translate-y-1 scale-95 opacity-0"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping motion-reduce:animate-none"
                />
                <span>{recentCredit.label}</span>
              </span>
            )}
          </div>
          {isFakeBalance && <p className="text-xs text-yellow-400 mt-1">🔒 Privacy mode active (tap to reveal real)</p>}
        </div>

        {cashbackBalance > 0 && showBalance && (
          <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-yellow-400 relative z-10">
            <Gift className="h-3.5 w-3.5" />
            <span>₦{formattedCashback} cashback earned</span>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2.5 relative z-10">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 text-xs backdrop-blur shadow-inner">
            <span className="text-slate-400 text-[11px]">Vevu ID</span>
            <span className="font-mono font-bold text-cyan-300">{vevuId}</span>
            <button
              type="button"
              onClick={copyVevuId}
              aria-label="Copy Vevu ID"
              className="ml-1 rounded-lg bg-slate-800 p-1 hover:bg-slate-700 transition text-slate-300"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          {virtualAccountNumber && (
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/90 border border-slate-800 px-3.5 py-1.5 text-xs backdrop-blur shadow-inner">
              <Building2 className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              <span className="text-slate-400 text-[11px]">{virtualAccountBank}</span>
              <span className="font-mono font-bold text-slate-100">{virtualAccountNumber}</span>
              <div className="ml-0.5 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void copyVirtualAccount()}
                  aria-label="Copy virtual account number"
                  title="Copy account number"
                  className="rounded-lg bg-slate-800 p-1 hover:bg-slate-700 transition text-slate-300"
                >
                  {copiedAccount ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => void shareVirtualAccount()}
                  disabled={isSharingAccount}
                  aria-label="Share virtual account details"
                  title="Share account details"
                  className="rounded-lg bg-slate-800 p-1 hover:bg-slate-700 transition text-slate-300 disabled:opacity-50"
                >
                  <Share2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons inside Card */}
        <div className="mt-5 space-y-2.5 relative z-10">
          <div className="grid grid-cols-2 gap-3">
            <Link to="/fund-wallet" className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:brightness-115 transition">
              <Plus className="h-4 w-4" /> Fund wallet
            </Link>
            <Link
              to="/transfer"
              aria-disabled={isTransferDisabled}
              tabIndex={isTransferDisabled ? -1 : 0}
              title={
                isWalletLoading
                  ? "Checking wallet balance..."
                  : balance <= 0
                    ? "Fund your wallet to send a transfer"
                    : "Transfer funds"
              }
              onClick={(e) => {
                if (isTransferDisabled) {
                  e.preventDefault();
                }
              }}
              className={`flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-600 to-emerald-600 py-3 text-sm font-bold text-white transition ${
                isTransferDisabled
                  ? "cursor-not-allowed opacity-45 pointer-events-none shadow-none"
                  : "shadow-lg shadow-emerald-500/20 hover:brightness-115"
              }`}
            >
              <Send className="h-4 w-4" /> Transfer
            </Link>
          </div>

          {isZeroBalance && (
            <p className="text-xs text-slate-400">
              Your wallet balance is ₦0.00.{" "}
              <Link
                to="/fund-wallet"
                className="font-semibold text-cyan-400 underline underline-offset-4 hover:text-cyan-300 transition"
              >
                Fund your wallet
              </Link>{" "}
              to start sending money or paying bills.
            </p>
          )}
        </div>
      </section>

      <PromoWidget />

      {/* QUICK ACTIONS GRID */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            Quick actions
          </h2>
          <Link to="/all-services" className="text-xs font-semibold text-cyan-400 hover:underline flex items-center gap-0.5">
            See all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {coreServices.map((s) => (
            <Link key={s.name} to="/purchase/$service" params={{ service: s.serviceSlug }}
              className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${s.tint} border p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col items-center justify-center gap-2.5 min-h-[96px]`}>
              <div className="p-2.5 rounded-2xl bg-slate-900/60 border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-300">
                <s.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold text-slate-200 tracking-wide">{s.name}</span>
            </Link>
          ))}
          <Link to="/all-services" className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/40 via-slate-900/40 to-slate-950/60 border border-slate-800 p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 flex flex-col items-center justify-center gap-2.5 min-h-[96px]">
            <div className="p-2.5 rounded-2xl bg-slate-900/80 border border-white/5 shadow-inner group-hover:scale-110 transition-transform duration-300 text-slate-400">
              <Grid3x3 className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold text-slate-300 tracking-wide">More</span>
          </Link>
        </div>
      </section>

      {/* PROMO BANNER: REFER & EARN */}
      <Link
        to="/referrals"
        className="group relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-950 p-4 border border-purple-500/30 flex items-center justify-between transition hover:border-purple-500/60 shadow-md"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-purple-500/20 border border-purple-500/20">
            <Gift className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Refer & Earn ₦50</p>
            <p className="text-xs text-slate-400 mt-0.5">Invite friends and get rewarded when they buy.</p>
          </div>
        </div>
        <div className="p-2 rounded-full bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition">
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* PROMO BANNER: SAVINGS */}
      <Link
        to="/savings"
        className="group relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 p-4 border border-emerald-500/30 flex items-center justify-between transition hover:border-emerald-500/60 shadow-md"
      >
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/20">
            <PiggyBank className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Save for something</p>
            <p className="text-xs text-slate-400 mt-0.5">Set a goal, save daily or weekly.</p>
          </div>
        </div>
        <div className="p-2 rounded-full bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20 transition">
          <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* RECENT ACTIVITY */}
      <RecentActivity userId={user?.id} hideRecentTx={hideRecentTx} limit={5} />
    </div>
  );
}
