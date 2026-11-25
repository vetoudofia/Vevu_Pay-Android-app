import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface FreezeSearchParams {
  token?: string;
}

type FreezeStatus =
  | "missing_token"
  | "ready"
  | "freezing"
  | "frozen"
  | "error";

export const Route = createFileRoute("/freeze-account")({
  head: () => ({
    meta: [{ title: "Freeze Account — VevuPay" }],
  }),
  validateSearch: (search: Record<string, unknown>): FreezeSearchParams => ({
    token: typeof search.token === "string" ? search.token.trim() : undefined,
  }),
  component: FreezeAccountPage,
});

function FreezeAccountPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/freeze-account" });
  const token = search.token?.trim() || "";

  const [status, setStatus] = useState<FreezeStatus>(() =>
    token ? "ready" : "missing_token",
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("missing_token");
      setMessage(
        "No freeze token was found in this link. Open the link directly from your VevuPay security alert email.",
      );
    } else if (status === "missing_token") {
      setStatus("ready");
      setMessage("");
    }
  }, [token, status]);

  const handleConfirmFreeze = async () => {
    if (!token) {
      setStatus("missing_token");
      setMessage("Missing freeze token.");
      return;
    }

    setStatus("freezing");
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke(
        "freeze-account-with-token",
        {
          body: { token },
        },
      );

      if (error) {
        let detail = error.message || "Unable to freeze account.";
        const ctx = (error as { context?: Response }).context;
        if (ctx instanceof Response) {
          try {
            const payload = await ctx.clone().json();
            if (payload?.error) detail = String(payload.error);
            else if (payload?.message) detail = String(payload.message);
          } catch {
            // Keep fallback error message
          }
        }
        throw new Error(detail);
      }

      if (!data || data.success === false) {
        throw new Error(
          data?.error || data?.message || "Unable to freeze account.",
        );
      }

      setStatus("frozen");
      setMessage(
        data.message ||
          "Your VevuPay account has been frozen. Outbound transfers and security changes are blocked until unlocked.",
      );
      toast.success("Account frozen successfully.");
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "Failed to freeze account. The link may be expired or already used.";
      setStatus("error");
      setMessage(errMsg);
      toast.error(errMsg);
    }
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-lg items-center justify-center px-4 py-10">
      <div className="surface w-full rounded-2xl border border-border p-6 shadow-xl">
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="mb-5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to VevuPay
        </button>

        {status === "missing_token" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">Invalid Freeze Link</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              Sign In to Security Settings
            </button>
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Freeze VevuPay Account</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirming will immediately restrict outbound activity on your
                  account if you did not authorize the recent security change.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3.5 text-xs text-muted-foreground">
              This emergency freeze link is time-limited and single-use.
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: "/" })}
                className="flex-1 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:opacity-90"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFreeze}
                className="flex-[2] rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Freeze Account Now
              </button>
            </div>
          </div>
        )}

        {status === "freezing" && (
          <div className="space-y-3 py-6 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-red-500" />
            <h1 className="text-lg font-bold">Freezing Your Account...</h1>
            <p className="text-sm text-muted-foreground">
              Validating your security token and locking account activity.
            </p>
          </div>
        )}

        {status === "frozen" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">Account Frozen</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <button
              type="button"
              onClick={() => navigate({ to: "/auth" })}
              className="btn-primary w-full py-2.5 text-sm font-semibold"
            >
              Go to Sign In
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-500">
              <XCircle className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">Could Not Freeze Account</h1>
            <p className="text-sm text-muted-foreground">{message}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmFreeze}
                className="flex-1 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition hover:opacity-90"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/auth" })}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold"
              >
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
