// src/components/VerifyIpScreen.tsx
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ShieldAlert,
  Mail,
  Send,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Globe,
} from "lucide-react";

interface VerifyIpScreenProps {
  email: string;
  ipAddress?: string | null;
  onVerified: () => Promise<void> | void;
  onBack: () => void;
}

export function VerifyIpScreen({
  email,
  ipAddress,
  onVerified,
  onBack,
}: VerifyIpScreenProps) {
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const startCooldown = (seconds = 30) => {
    setCooldownSeconds(seconds);
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const extractErrorMessage = async (err: any, fallback: string) => {
    try {
      const ctx = err?.context;
      if (ctx && typeof ctx.json === "function") {
        const body = await ctx.json();
        if (typeof body?.error === "string" && body.error.trim()) {
          return body.error;
        }
        if (typeof body?.message === "string" && body.message.trim()) {
          return body.message;
        }
      }
    } catch {
      // Ignore parse error
    }
    return err?.message || fallback;
  };

  const handleSendOtp = async () => {
    if (sendingOtp || cooldownSeconds > 0) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Missing account email. Please return to login.");
      return;
    }

    setSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: {
          email: normalizedEmail,
          purpose: "ip_verification",
          ...(ipAddress ? { ip_address: ipAddress } : {}),
        },
      });

      if (error) {
        const msg = await extractErrorMessage(
          error,
          "Could not send verification code.",
        );
        toast.error(msg);
        return;
      }

      if (!data?.success) {
        toast.error(data?.error || "Could not send verification code.");
        return;
      }

      setOtpSent(true);
      startCooldown(30);
      toast.success("Verification code sent to your email.");
    } catch {
      toast.error("Unable to send verification code right now.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyingOtp) return;

    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = otpCode.trim();

    if (!/^\d{6}$/.test(cleanCode)) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }

    setVerifyingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: {
          email: normalizedEmail,
          otpCode: cleanCode,
          purpose: "ip_verification",
          ...(ipAddress ? { ip_address: ipAddress } : {}),
        },
      });

      if (error) {
        const msg = await extractErrorMessage(
          error,
          "Verification code could not be verified.",
        );
        toast.error(msg);
        return;
      }

      if (!data?.success || !data?.verified) {
        toast.error(data?.error || "Invalid or expired verification code.");
        return;
      }

      toast.success("Device IP verified!");
      await onVerified();
    } catch {
      toast.error("Unable to verify code right now.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl bg-slate-900/90 border border-amber-500/30 p-6 sm:p-7 text-white shadow-2xl backdrop-blur space-y-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800/80 border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Login
        </button>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-[11px] font-extrabold text-amber-300">
          <ShieldAlert className="h-3.5 w-3.5" />
          IP Security
        </span>
      </div>

      <div className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
          <ShieldAlert className="h-7 w-7" />
        </div>

        <h2 className="text-xl font-extrabold text-white tracking-tight">
          New device detected
        </h2>

        <p className="text-xs text-slate-400 leading-relaxed">
          We noticed a sign-in attempt from an unrecognized IP address. Verify
          this device via email OTP before accessing your account.
        </p>
      </div>

      <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-3.5 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <Mail className="h-3.5 w-3.5 text-cyan-400" />
            Account
          </span>
          <span className="font-semibold text-white truncate">{email}</span>
        </div>

        {ipAddress && ipAddress !== "unknown" && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <span className="inline-flex items-center gap-1.5 text-slate-400">
              <Globe className="h-3.5 w-3.5 text-cyan-400" />
              Detected IP
            </span>
            <span className="font-mono font-bold text-cyan-300">
              {ipAddress}
            </span>
          </div>
        )}
      </div>

      {!otpSent ? (
        <button
          type="button"
          onClick={handleSendOtp}
          disabled={sendingOtp || cooldownSeconds > 0}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition disabled:opacity-50"
        >
          {sendingOtp ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {sendingOtp ? "Sending Code..." : "Verify Device (Send OTP)"}
        </button>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 text-center">
              Enter 6-Digit Verification Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) =>
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              autoFocus
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-center text-2xl font-mono font-bold tracking-[0.4em] text-white placeholder:text-slate-700 focus:outline-none focus:border-cyan-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={verifyingOtp || otpCode.length !== 6}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 transition disabled:opacity-50"
          >
            {verifyingOtp ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {verifyingOtp ? "Verifying..." : "Confirm & Continue"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handleSendOtp}
              disabled={sendingOtp || cooldownSeconds > 0}
              className="text-xs font-bold text-cyan-400 hover:text-cyan-300 disabled:text-slate-500 transition"
            >
              {cooldownSeconds > 0
                ? `Resend code in ${cooldownSeconds}s`
                : "Resend verification code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
