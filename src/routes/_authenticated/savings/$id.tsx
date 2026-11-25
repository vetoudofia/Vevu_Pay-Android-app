// src/routes/_authenticated/savings/$id.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { ArrowLeft, Plus, Loader2, PiggyBank, CheckCircle2, AlertTriangle, Trash2, Wallet, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/savings/$id")({
  component: SavingsGoalDetailPage,
});

interface SavingsGoal {
  id: string; title: string; service_type: string;
  target_amount: number; current_amount: number; status: string;
  metadata: any; created_at: string; cancellation_fee?: number;
}

async function hashPinSha256(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(pin));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function SavingsGoalDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [fundAmount, setFundAmount] = useState("");
  const [fundModal, setFundModal] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: goal, isLoading } = useQuery({
    queryKey: ["savings-goal", id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("savings_goals").select("*").eq("id", id).eq("user_id", user!.id).single();
      if (error) throw error;
      return data as SavingsGoal;
    },
  });

  const handleFundClick = () => {
    const amount = Number(fundAmount);
    if (!amount || amount < 100) {
      toast.error("Minimum ₦100");
      return;
    }
    setFundModal(false);
    setPinModal(true);
    setPin("");
    setPinError(null);
  };

  const handleFundWithPin = async () => {
    if (pin.length !== 6) {
      setPinError("Enter your 6-digit PIN");
      return;
    }

    if (!user) {
      setPinError("You must be signed in");
      return;
    }

    setSubmitting(true);
    setPinError(null);
    try {
      const amount = Number(fundAmount);
      const pinHash = await hashPinSha256(pin);

      const { data: result, error } = await supabase.rpc("fund_savings_goal", {
        p_goal_id: id,
        p_user_id: user.id,
        p_amount: amount,
        p_pin_hash: pinHash,
      });

      if (error) throw error;
      if (!result?.success) throw new Error(result?.error || "Failed to fund goal");

      toast.success(`₦${amount.toLocaleString()} added to your goal!`);
      setPinModal(false);
      setPin("");
      setFundAmount("");
      queryClient.invalidateQueries({ queryKey: ["savings-goal", id] });
      queryClient.invalidateQueries({ queryKey: ["savings-goals", user.id] });
      queryClient.invalidateQueries({ queryKey: ["wallet", user.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user.id] });
    } catch (err: any) {
      setPinError(err.message || "Failed to fund goal");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      const { data: result, error } = await supabase.rpc("cancel_savings_goal", { p_goal_id: id, p_user_id: user!.id });
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      toast.success(`Goal cancelled. ₦${Number(result.refund).toLocaleString()} refunded (fee: ₦${Number(result.fee).toLocaleString()})`);
      setCancelModal(false);
      queryClient.invalidateQueries({ queryKey: ["wallet", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
      navigate({ to: "/savings" });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel goal");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setSubmitting(true);
    try {
      const { data: result, error } = await supabase.rpc("refund_savings_goal", { p_goal_id: id, p_user_id: user!.id });
      if (error) throw error;
      if (!result.success) throw new Error(result.error);
      toast.success(`₦${Number(result.amount).toLocaleString()} moved to your wallet!`);
      setWithdrawModal(false);
      queryClient.invalidateQueries({ queryKey: ["wallet", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["savings-goals", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
      navigate({ to: "/savings" });
    } catch (err: any) {
      toast.error(err.message || "Failed to withdraw");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="mx-auto max-w-2xl px-4 py-6"><div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></div>;
  }
  if (!goal) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-center"><p className="text-sm text-muted-foreground">Goal not found</p></div>;
  }

  const progress = Math.min(100, (Number(goal.current_amount) / Number(goal.target_amount)) * 100);
  const isReady = goal.status === "ready" || Number(goal.current_amount) >= Number(goal.target_amount);
  const canFund = goal.status === "active";
  const canCancel = goal.status === "active";
  const cancelFee = Math.min(Number(goal.current_amount) * 0.05, 500);
  const refundAmount = Number(goal.current_amount) - cancelFee;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/savings" })} className="rounded-full p-2 hover:bg-secondary transition"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="text-lg font-bold flex-1 truncate">{goal.title}</h1>
      </div>

      <div className={`surface p-6 text-center ${isReady ? "bg-gradient-to-br from-green-500/10 to-emerald-500/5" : "bg-gradient-to-br from-primary/10 to-cyan-500/5"}`}>
        <PiggyBank className={`h-8 w-8 mx-auto mb-2 ${isReady ? "text-green-500" : "text-primary"}`} />
        <p className="text-xs text-muted-foreground">Saved so far</p>
        <p className="mt-1 text-4xl font-bold">₦{Number(goal.current_amount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
        <p className="mt-1 text-xs text-muted-foreground">of ₦{Number(goal.target_amount).toLocaleString()}</p>
        <div className="mt-4 h-2 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full rounded-full transition-all ${isReady ? "bg-green-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs font-medium">{progress.toFixed(0)}% complete</p>
        {isReady && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />Goal reached!
          </div>
        )}
      </div>

      <div className="space-y-2">
        {canFund && (
          <button onClick={() => setFundModal(true)} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" />Add Money
          </button>
        )}

        {isReady && (
          <button onClick={() => setWithdrawModal(true)} className="btn-primary w-full py-3 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700">
            <Wallet className="h-4 w-4" />Withdraw to Wallet
          </button>
        )}

        {canCancel && (
          <button onClick={() => setCancelModal(true)} className="w-full py-3 rounded-lg border border-destructive/30 text-destructive font-medium hover:bg-destructive/5 transition flex items-center justify-center gap-2">
            <Trash2 className="h-4 w-4" />Cancel Goal
          </button>
        )}
      </div>

      {/* Fund Modal */}
      {fundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Add Money</h3>
            <p className="text-xs text-muted-foreground mb-4">Money moves from your wallet to this goal.</p>
            <div className="relative mb-4">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">₦</span>
              <input type="number" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="500" className="input-field pl-8 text-lg font-semibold" autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setFundModal(false)} className="flex-1 py-2 rounded-lg bg-secondary font-medium">Cancel</button>
              <button onClick={handleFundClick} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {pinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-primary/10"><Lock className="h-6 w-6 text-primary" /></div>
            </div>
            <h3 className="text-lg font-bold text-center mb-2">Enter Transaction PIN</h3>
            <p className="text-xs text-muted-foreground text-center mb-4">Confirm moving ₦{Number(fundAmount).toLocaleString()} to this goal</p>
            {pinError && <div className="bg-destructive/10 text-destructive text-xs p-2 rounded mb-3">{pinError}</div>}
            <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className="input-field text-center text-2xl tracking-[0.5em] font-mono mb-4" placeholder="••••••" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => { setPinModal(false); setPin(""); setPinError(null); setFundModal(true); }} className="flex-1 py-2 rounded-lg bg-secondary font-medium">Back</button>
              <button onClick={handleFundWithPin} disabled={submitting || pin.length !== 6} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw Modal */}
      {withdrawModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-green-500/10"><Wallet className="h-6 w-6 text-green-500" /></div>
            </div>
            <h3 className="text-lg font-bold text-center mb-2">Withdraw to Wallet?</h3>
            <p className="text-xs text-muted-foreground text-center mb-4">
              ₦{Number(goal.current_amount).toLocaleString()} will be moved to your main wallet. No fee.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setWithdrawModal(false)} className="flex-1 py-2 rounded-lg bg-secondary font-medium">Cancel</button>
              <button onClick={handleWithdraw} disabled={submitting} className="flex-1 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Withdraw"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex justify-center mb-3">
              <div className="p-3 rounded-full bg-destructive/10"><AlertTriangle className="h-6 w-6 text-destructive" /></div>
            </div>
            <h3 className="text-lg font-bold text-center mb-2">Cancel this goal?</h3>
            <p className="text-xs text-muted-foreground text-center mb-4">
              You'll get ₦{refundAmount.toLocaleString()} back (a fee of ₦{cancelFee.toLocaleString()} applies).
            </p>
            <div className="flex gap-2">
              <button onClick={() => setCancelModal(false)} className="flex-1 py-2 rounded-lg bg-secondary font-medium">Keep Goal</button>
              <button onClick={handleCancel} disabled={submitting} className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground font-medium disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Cancel Goal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
