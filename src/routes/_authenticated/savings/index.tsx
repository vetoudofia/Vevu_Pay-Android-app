// src/routes/_authenticated/savings/index.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { Plus, PiggyBank, Loader2, Target, Wifi, CreditCard, Tv, Zap, Dice6, BookOpen, ChevronRight, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/savings/")({
  head: () => ({ meta: [{ title: "Savings — VevuPay" }] }),
  component: SavingsListPage,
});

const SERVICE_ICONS: Record<string, any> = {
  data: Wifi, airtime: CreditCard, tv: Tv, electricity: Zap, bet: Dice6, education: BookOpen,
};

const STATUS_CONFIG = {
  active: { label: "Saving", color: "text-primary", bg: "bg-primary/10" },
  ready: { label: "Ready", color: "text-green-500", bg: "bg-green-500/10" },
};

interface SavingsGoal {
  id: string; title: string; service_type: string;
  target_amount: number; current_amount: number; status: string;
  metadata: any; created_at: string;
}

function SavingsListPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<"all" | "active" | "ready">("all");

  const { data: goals, isLoading } = useQuery({
    queryKey: ["savings-goals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // ✅ Only show active and ready goals
      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user!.id)
        .in("status", ["active", "ready"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SavingsGoal[];
    },
  });

  const filtered = goals?.filter((g) => filter === "all" || g.status === filter) ?? [];
  const totalSaved = goals?.reduce((sum, g) => sum + Number(g.current_amount), 0) ?? 0;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PageHeader title="Savings" subtitle="Save for what matters" />
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-start justify-between">
        <PageHeader title="Savings" subtitle="Save toward your next bill" />
        <div className="flex gap-2">
          <Link to="/savings/history" className="text-xs text-muted-foreground hover:text-foreground px-3 py-2">History</Link>
          <Link to="/savings/new" className="btn-primary shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm">
            <Plus className="h-4 w-4" /> New Goal
          </Link>
        </div>
      </div>

      <div className="surface p-5 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border-emerald-500/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><PiggyBank className="h-4 w-4" />Total Saved</div>
        <p className="mt-1 text-3xl font-bold text-emerald-600 dark:text-emerald-400">₦{totalSaved.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</p>
        <p className="mt-1 text-xs text-muted-foreground">Across {goals?.length ?? 0} goal{(goals?.length ?? 0) !== 1 ? "s" : ""}</p>
      </div>

      {goals && goals.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {(["all", "active", "ready"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`chip capitalize whitespace-nowrap transition ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground"}`}>
              {f === "ready" ? "Ready" : f}
            </button>
          ))}
        </div>
      )}

      {!filtered.length ? (
        <div className="surface p-10 text-center">
          <div className="inline-flex p-3 rounded-full bg-primary/10 mb-3"><Target className="h-6 w-6 text-primary" /></div>
          <p className="text-sm font-medium">{filter === "all" ? "No savings goals yet" : `No ${filter} goals`}</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">{filter === "all" ? "Start saving for your next DSTV, data, or electricity bill." : "Try a different filter."}</p>
          {filter === "all" && (
            <Link to="/savings/new" className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm">
              <Plus className="h-4 w-4" /> Create First Goal
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((goal) => {
            const Icon = SERVICE_ICONS[goal.service_type] || PiggyBank;
            const status = STATUS_CONFIG[goal.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.active;
            const progress = goal.target_amount > 0 ? Math.min(100, (goal.current_amount / goal.target_amount) * 100) : 0;
            
            return (
              <li key={goal.id}>
                <Link to="/savings/$id" params={{ id: goal.id }} className="surface p-4 block transition hover:border-primary/40">
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 p-2.5 rounded-lg ${status.bg}`}><Icon className={`h-5 w-5 ${status.color}`} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{goal.title}</p>
                          <p className="text-xs text-muted-foreground">₦{Number(goal.current_amount).toLocaleString()} of ₦{Number(goal.target_amount).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {goal.status === "ready" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                          {goal.status === "active" && <Clock className="h-4 w-4 text-primary" />}
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${goal.status === "ready" ? "bg-green-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className={`font-medium ${status.color}`}>{status.label}</span>
                        <span className="text-muted-foreground">{progress.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
