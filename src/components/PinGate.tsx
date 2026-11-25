// src/components/PinGate.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldCheck, X, Delete } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

type Resolver = (ok: boolean) => void;

async function verifyPin(pin: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("verify-transaction-pin", {
    body: { pin },
  });
  if (error) {
    let message = error.message || "Could not verify PIN";
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    if (ctx?.text) {
      try {
        const parsed = JSON.parse(await ctx.text());
        message = parsed.error || parsed.message || message;
      } catch {
        /* keep default message */
      }
    }
    return { ok: false, error: message };
  }
  if (data?.success || data?.valid) return { ok: true };
  return { ok: false, error: data?.error || "Incorrect PIN" };
}

/**
 * Gates a sensitive action behind the user's 6-digit transaction PIN.
 *
 * const { requirePin, pinGate } = usePinGate();
 * if (!(await requirePin("Send ₦5,000 to John"))) return;
 */
export function usePinGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string | undefined>();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("transaction_pin")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setHasPin(!!data?.transaction_pin);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const requirePin = useCallback((actionLabel?: string) => {
    setLabel(actionLabel);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpen(false);
    resolverRef.current?.(ok);
    resolverRef.current = null;
  }, []);

  const pinGate = open ? (
    <PinDialog hasPin={hasPin} label={label} onDone={settle} />
  ) : null;

  return { requirePin, pinGate, hasPin };
}

function PinDialog({
  hasPin,
  label,
  onDone,
}: {
  hasPin: boolean | null;
  label?: string;
  onDone: (ok: boolean) => void;
}) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (value: string) => {
      setChecking(true);
      setError(null);
      const res = await verifyPin(value);
      setChecking(false);
      if (res.ok) {
        onDone(true);
        return;
      }
      setPin("");
      setError(res.error || "Incorrect PIN");
    },
    [onDone],
  );

  const press = (digit: string) => {
    if (checking) return;
    setPin((prev) => {
      const next = (prev + digit).slice(0, 6);
      if (next.length === 6) void submit(next);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center">
      <div className="surface w-full max-w-sm p-5 pb-7 sm:pb-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold">Confirm with PIN</p>
              {label && <p className="text-xs text-muted-foreground">{label}</p>}
            </div>
          </div>
          <button
            onClick={() => onDone(false)}
            aria-label="Cancel"
            className="rounded-full p-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasPin === false ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              You haven't set a transaction PIN yet. Set one to authorise payments.
            </p>
            <Link to="/pin" onClick={() => onDone(false)} className="btn-primary w-full">
              Set transaction PIN
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-5 flex justify-center gap-2.5" aria-live="polite">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full transition ${
                    i < pin.length ? "bg-primary scale-110" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="mb-3 text-center text-xs font-medium text-destructive">{error}</p>
            )}
            {checking && (
              <p className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying…
              </p>
            )}

            <div className="grid grid-cols-3 gap-2.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <PinKey key={d} onClick={() => press(d)}>
                  {d}
                </PinKey>
              ))}
              <PinKey onClick={() => onDone(false)} muted>
                Cancel
              </PinKey>
              <PinKey onClick={() => press("0")}>0</PinKey>
              <PinKey onClick={() => setPin((p) => p.slice(0, -1))} muted>
                <Delete className="h-4 w-4" />
              </PinKey>
            </div>

            <Link
              to="/pin"
              onClick={() => onDone(false)}
              className="mt-4 block text-center text-xs text-muted-foreground underline"
            >
              Forgot or change PIN?
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function PinKey({
  children,
  onClick,
  muted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid h-12 place-items-center rounded-xl border border-border text-base font-semibold transition active:scale-95 ${
        muted
          ? "bg-transparent text-xs font-medium text-muted-foreground hover:text-foreground"
          : "bg-secondary/40 hover:bg-secondary/70"
      }`}
    >
      {children}
    </button>
  );
}
