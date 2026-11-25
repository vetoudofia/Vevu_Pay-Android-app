import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useWalletBalance } from "@/hooks/useWalletBalance";

const SOUND_STORAGE_KEY = "vevupay_deposit_chime_enabled";
const CREDITED_BADGE_DURATION_MS = 4000;
const BALANCE_HIGHLIGHT_DURATION_MS = 1600;

const NGN_FORMATTER = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
});

function readStoredSoundPreference(defaultValue: boolean): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const saved = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (saved === null) return defaultValue;
    return saved === "true";
  } catch {
    return defaultValue;
  }
}

function formatTransferSummary({
  accountNumber,
  bankName,
  accountName,
}: {
  accountNumber: string;
  bankName?: string | null;
  accountName?: string | null;
}): string {
  const resolvedBank = bankName || "Paystack Virtual Account";
  const lines = [
    "VevuPay Funding Details",
    `Bank: ${resolvedBank}`,
    `Account Number: ${accountNumber}`,
  ];

  if (accountName) {
    lines.push(`Account Name: ${accountName}`);
  }

  return lines.join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback below
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
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
    // Two-note ascending chime (C6 -> G6)
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
    // Ignore audio errors when autoplay/sound is blocked by the browser
  }
}

interface WalletBalanceCardProps {
  userId: string | undefined;
  accountNumber?: string | null;
  bankName?: string | null;
  accountName?: string | null;
  enableSound?: boolean;
  fundWalletHref?: string;
  sendMoneyHref?: string;
  onFundWallet?: () => void;
  onSendMoney?: () => void;
  onBalanceCredited?: (amountCredited: number, newBalance: number) => void;
}

export function WalletBalanceCard({
  userId,
  accountNumber,
  bankName,
  accountName,
  enableSound = true,
  fundWalletHref = "/fund-wallet",
  sendMoneyHref = "/send-money",
  onFundWallet,
  onSendMoney,
  onBalanceCredited,
}: WalletBalanceCardProps) {
  const { balance, isLoading, error, refetch } = useWalletBalance(userId);
  const [chimeEnabled, setChimeEnabled] = useState<boolean>(() =>
    readStoredSoundPreference(enableSound),
  );
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [recentCredit, setRecentCredit] = useState<{
    id: number;
    label: string;
  } | null>(null);
  const [badgeEntered, setBadgeEntered] = useState<boolean>(false);
  const [balanceHighlighted, setBalanceHighlighted] = useState<boolean>(false);

  const previousBalanceRef = useRef<number | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const creditedBadgeTimeoutRef = useRef<number | null>(null);
  const balanceHighlightTimeoutRef = useRef<number | null>(null);
  const badgeEnterRafRef = useRef<number | null>(null);
  const creditCounterRef = useRef<number>(0);

  const clearFeedbackTimers = () => {
    if (creditedBadgeTimeoutRef.current !== null) {
      window.clearTimeout(creditedBadgeTimeoutRef.current);
      creditedBadgeTimeoutRef.current = null;
    }
    if (balanceHighlightTimeoutRef.current !== null) {
      window.clearTimeout(balanceHighlightTimeoutRef.current);
      balanceHighlightTimeoutRef.current = null;
    }
    if (badgeEnterRafRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(badgeEnterRafRef.current);
      badgeEnterRafRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      clearFeedbackTimers();
    };
  }, []);

  const navigateTo = (href: string) => {
    if (typeof window !== "undefined") {
      window.location.assign(href);
    }
  };

  const handleFundWalletClick = () => {
    if (onFundWallet) {
      onFundWallet();
      return;
    }
    navigateTo(fundWalletHref);
  };

  const isZeroBalance = !isLoading && balance <= 0;
  const isSendMoneyDisabled = isLoading || balance <= 0;

  const handleSendMoneyClick = () => {
    if (isSendMoneyDisabled) return;
    if (onSendMoney) {
      onSendMoney();
      return;
    }
    navigateTo(sendMoneyHref);
  };

  const handleCopyAccountNumber = async () => {
    if (!accountNumber) return;

    const didCopy = await copyTextToClipboard(accountNumber);
    if (didCopy) {
      setCopiedAccount(true);
      toast.success("Account number copied", {
        description: `${accountNumber} (${bankName || "Paystack Virtual Account"})`,
      });

      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedAccount(false);
      }, 2000);
    } else {
      toast.error("Could not copy account number", {
        description: "Please copy the account number manually.",
      });
    }
  };

  const handleShareAccountDetails = async () => {
    if (!accountNumber || isSharing) return;

    const summary = formatTransferSummary({
      accountNumber,
      bankName,
      accountName,
    });

    setIsSharing(true);
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

      const didCopy = await copyTextToClipboard(summary);
      if (didCopy) {
        toast.success("Transfer details copied", {
          description: "Formatted account summary copied to clipboard.",
        });
      } else {
        toast.error("Could not share account details", {
          description: "Please share or copy the account details manually.",
        });
      }
    } finally {
      setIsSharing(false);
    }
  };

  const handleToggleChime = () => {
    setChimeEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota or privacy-mode errors
      }
      if (next && enableSound) {
        playDepositChime();
      }
      return next;
    });
  };

  // Reset balance baseline and temporary visual cues when switching accounts
  useEffect(() => {
    previousBalanceRef.current = null;
    hasInitializedRef.current = false;
    setRecentCredit(null);
    setBadgeEntered(false);
    setBalanceHighlighted(false);
    clearFeedbackTimers();
  }, [userId]);

  useEffect(() => {
    if (isLoading) return;

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      previousBalanceRef.current = balance;
      return;
    }

    const previousBalance = previousBalanceRef.current ?? balance;
    const delta = Number((balance - previousBalance).toFixed(2));

    if (delta > 0) {
      const formattedCredit = NGN_FORMATTER.format(delta);
      const formattedNewBalance = NGN_FORMATTER.format(balance);

      clearFeedbackTimers();
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

      if (enableSound && chimeEnabled) {
        playDepositChime();
      }

      onBalanceCredited?.(delta, balance);
    }

    previousBalanceRef.current = balance;
  }, [balance, isLoading, enableSound, chimeEnabled, onBalanceCredited]);

  const formattedBalance = NGN_FORMATTER.format(balance);
  const isSoundActive = enableSound && chimeEnabled;

  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Available Balance</p>
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-3xl font-bold tracking-tight transition-colors duration-500 motion-reduce:transition-none ${
                balanceHighlighted
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {isLoading ? "Loading..." : formattedBalance}
            </p>
            {recentCredit && (
              <span
                key={recentCredit.id}
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/30 transition-all duration-300 ease-out motion-reduce:transition-none dark:text-emerald-400 ${
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleChime}
            disabled={!enableSound}
            aria-pressed={isSoundActive}
            aria-label={
              isSoundActive ? "Mute deposit chime" : "Unmute deposit chime"
            }
            title={
              isSoundActive
                ? "Deposit chime on (click to mute)"
                : "Deposit chime muted (click to unmute)"
            }
            className="rounded-md border px-2.5 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isSoundActive ? "🔔 Chime On" : "🔕 Muted"}
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {accountNumber && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">
                {bankName || "Paystack Virtual Account"}
              </p>
              <p className="font-mono text-base font-semibold">
                {accountNumber}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyAccountNumber}
                aria-label={`Copy virtual account number ${accountNumber}`}
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                {copiedAccount ? "✓ Copied" : "Copy"}
              </button>

              <button
                type="button"
                onClick={handleShareAccountDetails}
                disabled={isSharing}
                aria-label="Share virtual account details"
                className="rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {isSharing ? "Sharing..." : "Share"}
              </button>
            </div>
          </div>

          {accountName && (
            <p className="text-xs text-muted-foreground">{accountName}</p>
          )}
        </div>
      )}

      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleFundWalletClick}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-95"
          >
            + Fund Wallet
          </button>

          <button
            type="button"
            onClick={handleSendMoneyClick}
            disabled={isSendMoneyDisabled}
            aria-disabled={isSendMoneyDisabled}
            title={
              isLoading
                ? "Checking wallet balance..."
                : balance <= 0
                  ? "Fund your wallet to send money"
                  : "Send money from your wallet"
            }
            className="rounded-lg border bg-background px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            ↗ Send Money
          </button>
        </div>

        {isZeroBalance && (
          <p className="text-xs text-muted-foreground">
            Your wallet balance is ₦0.00.{" "}
            <button
              type="button"
              onClick={handleFundWalletClick}
              className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
            >
              Fund your wallet
            </button>{" "}
            {accountNumber
              ? "or transfer to your virtual account above to send money."
              : "to unlock transfers."}
          </p>
        )}
      </div>
    </div>
  );
}
