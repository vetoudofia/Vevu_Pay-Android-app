import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Clock, RefreshCw } from "lucide-react";
import { callEdgeFunction } from "@/lib/supabase";

export type PaymentPhase = "idle" | "pending" | "success" | "failed";

export interface PaymentStatusValue {
  phase: PaymentPhase;
  reference?: string;
  amount?: number;
  message?: string;
}

export function usePaymentStatus() {
  const [state, setState] = useState<PaymentStatusValue>({ phase: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState({ phase: "idle" });
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /**
   * Starts a verify-payment poll. Backend must accept { reference, ...meta }
   * and return { status: "success" | "pending" | "failed", message? }.
   */
  const track = async (opts: {
    reference: string;
    amount: number;
    payload: Record<string, unknown>;
    onSuccess?: () => void;
  }) => {
    setState({ phase: "pending", reference: opts.reference, amount: opts.amount, message: "Confirming your payment…" });
    const started = Date.now();
    const maxMs = 60_000;
    const interval = 3_000;

    const attempt = async (): Promise<void> => {
      try {
        const res = await callEdgeFunction<{ status?: string; message?: string }>(
          "verify-payment",
          { reference: opts.reference, ...opts.payload },
        );
        const s = (res.status || "").toLowerCase();
        if (s === "success" || s === "ok" || s === "successful") {
          setState({ phase: "success", reference: opts.reference, amount: opts.amount, message: res.message });
          opts.onSuccess?.();
          return;
        }
        if (s === "failed" || s === "error" || s === "declined") {
          setState({ phase: "failed", reference: opts.reference, amount: opts.amount, message: res.message || "Payment could not be confirmed." });
          return;
        }
        // pending — keep polling
      } catch (err) {
        // network/webhook race — keep polling until timeout, then surface the last error
        if (Date.now() - started >= maxMs) {
          setState({
            phase: "failed",
            reference: opts.reference,
            amount: opts.amount,
            message: err instanceof Error ? err.message : "Verification timed out.",
          });
          return;
        }
      }
      if (Date.now() - started >= maxMs) {
        setState({
          phase: "pending",
          reference: opts.reference,
          amount: opts.amount,
          message: "Still processing. Your webhook will complete this shortly — check Transactions.",
        });
        return;
      }
      timers.current.push(setTimeout(attempt, interval));
    };
    attempt();
  };

  const markFailed = (message: string, reference?: string) =>
    setState({ phase: "failed", reference, message });

  return { state, track, reset, markFailed };
}

export function PaymentStatusModal({
  value,
  onClose,
  onRetry,
  onSuccessCta,
}: {
  value: PaymentStatusValue;
  onClose: () => void;
  onRetry?: () => void;
  onSuccessCta?: { label: string; onClick: () => void };
}) {
  if (value.phase === "idle") return null;

  const cfg = {
    pending: {
      Icon: Loader2,
      title: "Confirming payment",
      tint: "text-primary",
      ring: "ring-primary/30",
      badge: "bg-primary/10 text-primary",
      badgeLabel: "Pending",
      spin: true,
    },
    success: {
      Icon: CheckCircle2,
      title: "Payment successful",
      tint: "text-success",
      ring: "ring-success/30",
      badge: "bg-success/15 text-success",
      badgeLabel: "Successful",
      spin: false,
    },
    failed: {
      Icon: XCircle,
      title: "Payment failed",
      tint: "text-destructive",
      ring: "ring-destructive/30",
      badge: "bg-destructive/15 text-destructive",
      badgeLabel: "Failed",
      spin: false,
    },
  }[value.phase];

  const Icon = cfg.Icon;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
          <div className={`grid h-20 w-20 place-items-center rounded-full bg-background ring-4 ${cfg.ring}`}>
            <Icon className={`h-10 w-10 ${cfg.tint} ${cfg.spin ? "animate-spin" : ""}`} />
          </div>
          <span className={`mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
            <Clock className="h-3 w-3" />
            {cfg.badgeLabel}
          </span>
          <h2 className="mt-3 text-xl font-bold">{cfg.title}</h2>
          {typeof value.amount === "number" && (
            <p className="mt-1 text-3xl font-bold tracking-tight">
              ₦{value.amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          )}
          {value.message && (
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">{value.message}</p>
          )}
          {value.reference && (
            <div className="mt-4 w-full rounded-xl bg-secondary/40 px-3 py-2 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reference</p>
              <p className="mt-0.5 truncate font-mono text-xs">{value.reference}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 bg-background/40 p-4">
          {value.phase === "success" && onSuccessCta && (
            <button
              onClick={onSuccessCta.onClick}
              className="btn-primary w-full"
            >
              {onSuccessCta.label}
            </button>
          )}
          {value.phase === "failed" && onRetry && (
            <button onClick={onRetry} className="btn-primary w-full">
              <RefreshCw className="h-4 w-4" /> Try again
            </button>
          )}
          <button onClick={onClose} className="btn-secondary w-full">
            {value.phase === "pending" ? "Continue in background" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
