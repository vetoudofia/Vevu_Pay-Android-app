import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";

type EmailOtpResendProps = {
  email?: string;
  onResend: (email: string) => Promise<void>;
  disabled?: boolean;
  label?: string;
};

/**
 * A two-step resend flow that reminds people to check Spam/Junk before
 * requesting another verification email.
 */
export function EmailOtpResend({
  email = "",
  onResend,
  disabled = false,
  label = "Resend email",
}: EmailOtpResendProps) {
  const [expanded, setExpanded] = useState(false);
  const [address, setAddress] = useState(email);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    const normalizedEmail = address.trim().toLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter a valid email address to resend the verification email.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      await onResend(normalizedEmail);
      setExpanded(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't resend the email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      {!expanded ? (
        <button
          type="button"
          disabled={disabled || sending}
          onClick={() => {
            setAddress(email);
            setError(null);
            setExpanded(true);
          }}
          className="w-full rounded-lg py-2 text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {label}
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">Check your Spam or Junk folder</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Verification emails can sometimes be filtered there. If the email isn't there, choose the button below and we'll send it again.
              </p>
            </div>
          </div>
          {!email && (
            <label className="block text-left text-xs font-medium text-muted-foreground">
              Email address
              <input
                type="email"
                autoComplete="email"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="input-field mt-1.5"
                placeholder="you@example.com"
              />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              disabled={sending}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={disabled || sending}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              It's not there — resend
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
