// src/routes/_authenticated/savings/new.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Wifi, CreditCard, Tv, Zap, Dice6, BookOpen, ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/savings/new")({
  head: () => ({ meta: [{ title: "New Goal — VevuPay" }] }),
  component: NewGoalPage,
});

const SERVICES = [
  { value: "data", label: "Data", icon: Wifi, placeholder: "e.g., MTN 10GB Monthly" },
  { value: "airtime", label: "Airtime", icon: CreditCard, placeholder: "e.g., ₦5,000 Airtime" },
  { value: "tv", label: "Cable TV", icon: Tv, placeholder: "e.g., DSTV Compact" },
  { value: "electricity", label: "Electricity", icon: Zap, placeholder: "e.g., IKEDC Prepaid" },
  { value: "bet", label: "Betting", icon: Dice6, placeholder: "e.g., Bet9ja Wallet" },
  { value: "education", label: "Exam Pins", icon: BookOpen, placeholder: "e.g., WAEC Result Checker" },
];

function NewGoalPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [service, setService] = useState<string>("data");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [autoSave, setAutoSave] = useState(false);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [autoAmount, setAutoAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const targetNum = Number(target);
    if (!targetNum || targetNum < 1000) {
      toast.error("Minimum target is ₦1,000");
      return;
    }

    if (autoSave) {
      const autoNum = Number(autoAmount);
      if (!autoNum || autoNum < 100) {
        toast.error("Minimum auto-save amount is ₦100");
        return;
      }
      if (autoNum >= targetNum) {
        toast.error("Auto-save amount should be less than the target");
        return;
      }
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("savings_goals").insert({
        user_id: user.id,
        title: title.trim() || SERVICES.find((s) => s.value === service)?.placeholder || "My Goal",
        service_type: service,
        target_amount: targetNum,
        auto_save_enabled: autoSave,
        auto_save_frequency: autoSave ? frequency : null,
        auto_save_amount: autoSave ? Number(autoAmount) : 0,
      });

      if (error) throw error;
      toast.success("Savings goal created!");
      navigate({ to: "/savings" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create goal");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate({ to: "/savings" })} className="rounded-full p-2 hover:bg-secondary transition">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">New Savings Goal</h1>
          <p className="text-xs text-muted-foreground">Save toward your next bill</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Service Type */}
        <div className="surface p-4">
          <label className="text-xs font-medium text-muted-foreground mb-2 block">What are you saving for?</label>
          <div className="grid grid-cols-3 gap-2">
            {SERVICES.map((s) => {
              const Icon = s.icon;
              const active = service === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setService(s.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Goal Name */}
        <div className="surface p-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground block">Goal name</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={SERVICES.find((s) => s.value === service)?.placeholder}
            className="input-field"
            maxLength={50}
          />
        </div>

        {/* Target */}
        <div className="surface p-4 space-y-2">
          <label className="text-xs font-medium text-muted-foreground block">Target amount (₦)</label>
          <input
            type="number"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="5000"
            className="input-field"
            min={1000}
            required
          />
          <p className="text-[11px] text-muted-foreground">Minimum ₦1,000</p>
        </div>

        {/* Auto-Save */}
        <div className="surface p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-save</p>
              <p className="text-xs text-muted-foreground">Save automatically</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoSave(!autoSave)}
              className={`relative h-6 w-11 rounded-full transition ${autoSave ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${autoSave ? "translate-x-5" : ""}`} />
            </button>
          </div>

          {autoSave && (
            <div className="space-y-3 pt-2 border-t border-border/60">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Frequency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["daily", "weekly", "monthly"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFrequency(f)}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${
                        frequency === f
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-background/40 text-muted-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Amount per save (₦)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={autoAmount}
                  onChange={(e) => setAutoAmount(e.target.value)}
                  placeholder="500"
                  className="input-field"
                  min={100}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  We'll auto-save ₦{autoAmount || 0} every {frequency}
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full py-3 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Create Goal
            </>
          )}
        </button>
      </form>
    </div>
  );
}
