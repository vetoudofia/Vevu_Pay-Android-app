// src/routes/_authenticated/verify-identity.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, UserCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/verify-identity")({
  head: () => ({ meta: [{ title: "Verify Identity - VevuPay" }] }),
  component: VerifyIdentityPage,
});

function VerifyIdentityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [bvn, setBvn] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([]);
  const [isLoadingBanks, setIsLoadingBanks] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);

  // ─── Fetch banks from edge function (use supabase.functions.invoke) ───
  const fetchBanks = async () => {
    setIsLoadingBanks(true);
    setBankError(null);

    try {
      // Use the Supabase client to invoke the edge function. This ensures the
      // correct URL and auth are used and avoids issues when VITE_SUPABASE_URL
      // is missing in the environment.
      console.log("🔗 Invoking edge function: list-banks");
      const { data, error } = await supabase.functions.invoke("list-banks");

      if (error) {
        throw new Error(error.message || "Failed to invoke list-banks");
      }

      // The edge function may return either an array directly or an object
      // like { status: 'success', data: [...] }. Handle both shapes.
      let banksData: any = data;

      if (banksData && banksData.data && Array.isArray(banksData.data)) {
        banksData = banksData.data;
      }

      if (!Array.isArray(banksData)) {
        throw new Error("Invalid banks response from edge function");
      }

      console.log("📦 Parsed result (banks):", banksData);

      if (banksData.length > 0) {
        setBanks(banksData);
      } else {
        throw new Error("No banks returned");
      }
    } catch (error: any) {
      console.error("❌ Error fetching banks:", error);
      setBankError(error.message || "Failed to load banks. Please refresh or try again later.");
      setBanks([]);
    } finally {
      setIsLoadingBanks(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  // ─── Rest of the component ────────────────────────────────────────
  const checkBVNExists = async (bvnValue: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("bvn", bvnValue)
      .neq("id", user?.id || "")
      .maybeSingle();
    if (error) return false;
    return !!data;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (bvn.length !== 11) {
      toast.error("BVN must be exactly 11 digits");
      setLoading(false);
      return;
    }

    if (accountNumber.length !== 10) {
      toast.error("Account number must be exactly 10 digits");
      setLoading(false);
      return;
    }

    try {
      const exists = await checkBVNExists(bvn);
      if (exists) {
        toast.error(
          "An account with this identity already exists. Please login. If this is your identity and you didn't create this account, contact support."
        );
        setLoading(false);
        return;
      }

      // Use Supabase functions.invoke for validate-customer as well. Pass the
      // request body as JSON; supabase client will handle auth/URL.
      console.log("🔗 Invoking edge function: validate-customer");

      const payload = {
        bvn: bvn,
        account_number: accountNumber,
        bank_code: bankCode,
        first_name: user?.user_metadata?.first_name || "",
        last_name: user?.user_metadata?.last_name || "",
      };

      const { data: validateData, error: validateError } = await supabase.functions.invoke(
        "validate-customer",
        {
          // supabase-js supports passing a string body (JSON). Include content-type
          // to be explicit.
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (validateError) {
        throw new Error(validateError.message || "Validation failed");
      }

      // Edge function may return { success: true } or another shape; handle robustly
      const result: any = validateData;

      if (result && (result.success === true || result.status === "success")) {
        // Mark the profile as verified in the database. Ideally this should be
        // done by your backend/webhook once verification truly completes, but
        // optimistically update here so the UI no longer forces the verify page.
        if (user) {
          try {
            const { error: updateError } = await supabase
              .from("profiles")
              .update({ bvn_verified: true })
              .eq("id", user.id);

            if (updateError) {
              console.warn("Failed to update profile bvn_verified locally:", updateError);
            }
          } catch (err) {
            console.error("Profile update error:", err);
          }
        }

        toast.success("Verification successful. Redirecting...");

        // Give the DB a moment to settle then navigate to dashboard. The
        // authenticated layout re-checks verification when the route changes.
        setTimeout(() => {
          navigate({ to: "/dashboard" });
        }, 800);
      } else {
        // try to extract error message from response
        const msg = result?.error || result?.message || "Verification failed. Please try again.";
        toast.error(msg);
      }
    } catch (err: any) {
      console.error("Verification error:", err);
      toast.error(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-2xl font-bold mb-2">Verify Your Identity</h1>
      <p className="text-sm text-muted-foreground mb-6">
        To comply with CBN regulations, we need to verify your identity before you can access all features.
        This process uses Paystack to securely validate your BVN and bank account.
      </p>

      {bankError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-destructive font-medium">❌ {bankError}</p>
          <button
            onClick={fetchBanks}
            className="mt-2 text-sm text-primary hover:underline flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 text-sm">
        <p className="font-medium text-yellow-600 dark:text-yellow-400">Secure and Private</p>
        <p className="text-xs text-muted-foreground mt-1">
          Your BVN and bank details are encrypted and only used for identity verification.
          We do not store your BVN in plain text.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            BVN (Bank Verification Number) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={11}
            value={bvn}
            onChange={(e) => setBvn(e.target.value.replace(/\D/g, "").slice(0, 11))}
            className="input-field"
            placeholder="Enter 11-digit BVN"
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Bank <span className="text-red-500">*</span>
          </label>
          <select
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            className="input-field"
            required
            disabled={isLoadingBanks}
          >
            <option value="">
              {isLoadingBanks ? "Loading banks..." : "Select your bank"}
            </option>
            {banks.map((bank) => (
              <option key={bank.code} value={bank.code}>
                {bank.name}
              </option>
            ))}
          </select>
          {!isLoadingBanks && banks.length === 0 && !bankError && (
            <p className="text-xs text-yellow-500 mt-1">No banks available. Please refresh.</p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Bank Account Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="input-field"
            placeholder="Enter 10-digit account number"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || isLoadingBanks || !!bankError}
          className="btn-primary w-full py-3 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Verifying...
            </>
          ) : (
            <>
              <UserCheck className="h-4 w-4 mr-2" />
              Verify Identity
            </>
          )}
        </button>
      </form>

      <div className="mt-6 p-4 rounded-lg bg-secondary/30 text-xs text-muted-foreground">
        <p>Your information is processed securely through Paystack.</p>
        <p className="mt-1">
          This verification is required by the Central Bank of Nigeria (CBN) for financial service providers.
        </p>
      </div>
    </div>
  );
}
