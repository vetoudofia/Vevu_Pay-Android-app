// src/routes/_authenticated/savings/history.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Wallet, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/savings/history")({
  head: () => ({ meta: [{ title: "Savings History — VevuPay" }] }),
  component: SavingsHistoryPage,
});

const ACTION_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  fund: { label: "Funded", icon: TrendingUp, color: "text-red-500" },
  withdraw: { label: "Withdrew", icon: Wallet, color: "text-green-500" },
  cancel: { label: "Cancelled", icon: XCircle, color: "text-orange-500" },
  purchase: { label: "Purchased", icon: TrendingDown, color: "text-primary" },
};

function SavingsHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: history, isLoading } = useQuery({
    queryKey: ["savings-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("savings_history")
        .select("*, savings_goals(title, service_type)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PageHeader title="Savings History" />
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/savings" })} className="rounded-full p-2 hover:bg-secondary transition"><ArrowLeft className="h-5 w-5" /></button>
        <PageHeader title="Savings History" subtitle="All your savings activity" />
      </div>

      {!history || history.length === 0 ? (
        <div className="surface p-10 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium">No savings activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a goal and start saving to see history here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {history.map((h: any) => {
            const cfg = ACTION_CONFIG[h.action] || ACTION_CONFIG.fund;
            const Icon = cfg.icon;
            return (
              <li key={h.id} className="surface p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-secondary/50`}><Icon className={`h-4 w-4 ${cfg.color}`} /></div>
                  <div>
                    <p className="text-sm font-medium">{cfg.label}: {h.savings_goals?.title || "Unknown Goal"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    {h.note && <p className="text-[10px] text-muted-foreground">{h.note}</p>}
                  </div>
                </div>
                <p className={`text-sm font-bold ${h.action === "fund" ? "text-red-500" : "text-green-500"}`}>
                  {h.action === "fund" ? "-" : "+"}₦{Number(h.amount).toLocaleString()}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
