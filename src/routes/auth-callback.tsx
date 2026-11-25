import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { clearSupabaseClientStorage, supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { EmailOtpResend } from "@/components/EmailOtpResend";

function clearUrlFragmentAndCallbackParams() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.hash = "";
    url.searchParams.delete("code");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    url.searchParams.delete("type");
    const nextSearch = url.searchParams.toString();
    window.history.replaceState(
      {},
      document.title,
      `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}`
    );
  } catch {
    if (window.location.hash) {
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`
      );
    }
  }
}

function getSafeCallbackErrorMessage(rawMessage?: string | null): string {
  if (!rawMessage) {
    return "We couldn't verify this email. The link may have expired or already been used.";
  }
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes("expired") || normalized.includes("invalid")) {
    return "This verification link is invalid or has expired. Request a new email and try again.";
  }
  if (normalized.includes("already") || normalized.includes("used")) {
    return "This verification link has already been used. Try signing in or request a new email.";
  }
  return "We couldn't complete verification. Please try again or request a new email.";
}

function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    let redirectTimer: number | undefined;

    const handleCallback = async () => {
      try {
        if (typeof window === "undefined") return;

        const searchParams = new URLSearchParams(window.location.search);
        const rawHash = window.location.hash || "";
        const hashParams = new URLSearchParams(
          rawHash.startsWith("#") ? rawHash.slice(1) : rawHash
        );

        const errorParam = searchParams.get("error") || hashParams.get("error");
        const errorDesc =
          searchParams.get("error_description") || hashParams.get("error_description");
        const type = searchParams.get("type") || hashParams.get("type");
        const authCode = searchParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        clearUrlFragmentAndCallbackParams();

        if (errorParam) {
          if (!active) return;
          setStatus("error");
          setErrorMessage(getSafeCallbackErrorMessage(errorDesc));
          return;
        }

        if (authCode) {
          const { data: exchanged, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(authCode);
          if (exchangeError) {
            throw exchangeError;
          }
          if (!active) return;

          setEmail(exchanged.user?.email || "");
          clearSupabaseClientStorage({ includeAccountKeys: false });
          setStatus("success");
          toast.success(
            type === "recovery"
              ? "Password reset verified. Please sign in."
              : "Email confirmed successfully."
          );
          redirectTimer = window.setTimeout(() => {
            if (active) navigate({ to: "/auth" });
          }, 2000);
          return;
        }

        if (accessToken) {
          const { data, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          });
          if (setSessionError) throw setSessionError;
          if (!active) return;

          setEmail(data.user?.email || "");
          clearSupabaseClientStorage({ includeAccountKeys: false });
          setStatus("success");
          toast.success(
            type === "recovery"
              ? "Password reset verified. Please sign in."
              : "Email confirmed successfully."
          );
          redirectTimer = window.setTimeout(() => {
            if (active) navigate({ to: "/auth" });
          }, 2000);
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!active) return;

        if (session) {
          setEmail(session.user.email || "");
          clearSupabaseClientStorage({ includeAccountKeys: false });
          setStatus("success");
          toast.success(
            type === "recovery" ? "Password reset verified." : "Email confirmed successfully."
          );
          redirectTimer = window.setTimeout(() => {
            if (active) navigate({ to: "/auth" });
          }, 2000);
          return;
        }

        setStatus("error");
        setErrorMessage(
          "This confirmation link is incomplete or expired. Request a new email and try again."
        );
      } catch (reason) {
        clearUrlFragmentAndCallbackParams();
        if (!active) return;
        setStatus("error");
        setErrorMessage(
          getSafeCallbackErrorMessage(reason instanceof Error ? reason.message : null)
        );
      }
    };

    void handleCallback();
    return () => {
      active = false;
      if (redirectTimer !== undefined) window.clearTimeout(redirectTimer);
    };
  }, [navigate]);

  const resendConfirmation = async (targetEmail: string) => {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: normalizedEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth-callback` },
    });
    if (error) throw new Error(getSafeCallbackErrorMessage(error.message));
    setEmail(normalizedEmail);
    toast.success(
      "A new confirmation email is on its way. Check your inbox and Spam folder."
    );
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
        <div className="text-center">
          <Loader2
            className="mx-auto h-12 w-12 animate-spin text-primary"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Verifying your email securely…
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
          <div className="mb-4 flex justify-center">
            <XCircle className="h-16 w-16 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Verification unsuccessful
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMessage || "We couldn't verify your email."}
          </p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="w-full rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Back to sign in
            </button>
            <EmailOtpResend
              email={email}
              onResend={resendConfirmation}
              label="Resend confirmation email"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-gray-900">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
        <div className="mb-4 flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-green-500" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-green-600 dark:text-green-400">
          Email confirmed
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your email has been successfully verified.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Redirecting you to sign in…
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/auth" })}
          className="mt-6 w-full rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          Go to sign in
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/auth-callback")({ component: AuthCallback });
