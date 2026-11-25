// src/components/PromoWidget.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { Trophy, Clock, ChevronRight, Gift, X, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const NGN = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

interface RpcLeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string;
  score: number | string;
  prize_amount: number | string;
  is_winner: boolean;
}

interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  progress: number;
  prize: number;
  isWinner: boolean;
}

function getPromoRewardLabel(promo: any): string {
  if (
    promo?.equal_rewards === false &&
    Array.isArray(promo?.position_rewards) &&
    promo.position_rewards.length > 0
  ) {
    const topThree = promo.position_rewards
      .slice(0, 3)
      .map((amt: unknown, idx: number) => `#${idx + 1}: ${NGN.format(Number(amt || 0))}`)
      .join(" · ");
    return `Up to ${topThree}`;
  }
  if (Number(promo?.reward_amount || 0) > 0) {
    return `${NGN.format(Number(promo.reward_amount))} ${Number(promo.max_winners || 1) > 1 ? "each" : ""}`.trim();
  }
  return promo?.reward_description || "Cash Reward";
}

async function fetchPromoStandings(promo: any): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_promo_leaderboard", {
    p_promo_id: promo.id,
  });

  if (error) throw error;

  const rows = (data as RpcLeaderboardRow[] | null) ?? [];
  return rows.map((row, idx) => ({
    rank: Number(row.rank ?? idx + 1),
    userId: String(row.user_id),
    name: row.display_name || "VevuPay User",
    progress: Number(row.score ?? 0),
    prize: Number(row.prize_amount ?? 0),
    isWinner: Boolean(row.is_winner),
  }));
}

export function PromoWidget() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`promo-widget-sync-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["active-or-recent-promo", user.id],
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "referrals",
          filter: `referrer_id=eq.${user.id}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: ["active-or-recent-promo", user.id],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const { data: promoData, isLoading } = useQuery({
    queryKey: ["active-or-recent-promo", user?.id],
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const graceCutoffIso = new Date(nowMs - GRACE_PERIOD_MS).toISOString();

      const { data: promos, error } = await supabase
        .from("promos")
        .select("*")
        .lte("start_date", nowIso)
        .gte("end_date", graceCutoffIso)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!promos || promos.length === 0) return null;

      const visiblePromos = promos.filter((p: any) => {
        const st = String(p.status ?? "").toLowerCase();
        if (st === "inactive" || st === "draft" || st === "pending") return false;
        if (p.is_active === false && st !== "completed") return false;
        const endMs = new Date(p.end_date).getTime();
        return Number.isFinite(endMs) && nowMs <= endMs + GRACE_PERIOD_MS;
      });

      if (visiblePromos.length === 0) return null;
      const promo = visiblePromos[0];

      const standings = await fetchPromoStandings(promo);
      const myEntry = standings.find((s) => s.userId === user!.id) ?? null;

      return {
        promo,
        progress: myEntry ? myEntry.progress : 0,
        rank: myEntry ? myEntry.rank : null,
        standings,
      };
    },
  });

  if (isLoading || !promoData) return null;

  const { promo, progress, rank, standings } = promoData;
  const nowMs = Date.now();
  const endMs = new Date(promo.end_date).getTime();
  const isEnded = nowMs > endMs || String(promo.status ?? "").toLowerCase() === "completed";

  const targetCount = Math.max(Number(promo.target_value ?? promo.target_count ?? 1), 1);
  const percentage = Math.min((progress / targetCount) * 100, 100);
  const minRefSpend = Number(promo.min_referred_spend ?? 0);

  const remainingMs = isEnded
    ? Math.max(endMs + GRACE_PERIOD_MS - nowMs, 0)
    : Math.max(endMs - nowMs, 0);
  const daysLeft = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hoursLeft = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const formatMetric = (val: number) => {
    if (promo.rule_type === "purchase_volume") {
      return NGN.format(val);
    }
    return Number(val).toLocaleString("en-NG");
  };

  return (
    <>
      <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-yellow-500/20 border border-amber-500/30 rounded-2xl p-5 shadow-sm relative overflow-hidden">
        <div className="absolute -right-4 -top-4 opacity-10">
          <Trophy className="h-32 w-32 text-amber-500" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h3 className="font-bold text-foreground">{promo.title}</h3>
            </div>
            {isEnded ? (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                Ended
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                Auto-Tracked
              </span>
            )}
          </div>

          {promo.description && (
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {promo.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full text-xs font-bold">
              <Gift className="h-3 w-3" />
              Win: {getPromoRewardLabel(promo)}
            </div>

            {promo.rule_type === "referral_count" && (
              <div className="inline-flex items-center gap-1 bg-background/60 text-foreground px-2.5 py-1 rounded-full text-[11px] font-medium border border-amber-500/20">
                <Sparkles className="h-3 w-3 text-amber-500" />
                {minRefSpend > 0
                  ? `Invited user min spend: ${NGN.format(minRefSpend)}`
                  : "No minimum invited spend required"}
              </div>
            )}
          </div>

          {progress > 0 || rank !== null ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">
                  Your Progress: {formatMetric(progress)} / {formatMetric(targetCount)}
                </span>
                {rank !== null && (
                  <span className="text-amber-500 font-bold">
                    Rank: #{rank}
                  </span>
                )}
              </div>
              <div className="h-2.5 w-full bg-amber-500/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-2">
              {isEnded
                ? "This promotion has ended. Final standings remain visible for 7 days."
                : promo.rule_type === "referral_count"
                  ? "No manual join needed—your qualified referrals count automatically."
                  : "No manual join needed—your qualifying transactions count automatically."}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-amber-500/20">
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <Clock className="h-3.5 w-3.5" />
              {isEnded
                ? daysLeft > 0
                  ? `Ended · Shown for ${daysLeft}d ${hoursLeft}h more`
                  : `Ended · Shown for ${hoursLeft}h more`
                : daysLeft > 0
                  ? `${daysLeft}d ${hoursLeft}h left`
                  : `${hoursLeft}h left`}
            </div>
            <button
              type="button"
              onClick={() => setShowLeaderboard(true)}
              className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 hover:underline"
            >
              Leaderboard <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {showLeaderboard && (
        <LeaderboardModal
          promo={promo}
          userId={user!.id}
          standings={standings}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </>
  );
}

function LeaderboardModal({
  promo,
  userId,
  standings,
  onClose,
}: {
  promo: any;
  userId: string;
  standings: LeaderboardRow[];
  onClose: () => void;
}) {
  const formatScore = (val: number) => {
    if (promo.rule_type === "purchase_volume") return NGN.format(val);
    if (promo.rule_type === "referral_count") {
      return `${val.toLocaleString("en-NG")} qualified ${val === 1 ? "referral" : "referrals"}`;
    }
    return `${val.toLocaleString("en-NG")} completed`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card w-full max-w-md max-h-[85vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex justify-between items-center sticky top-0 bg-card rounded-t-3xl z-10">
          <div>
            <h3 className="font-bold text-foreground">Leaderboard</h3>
            <p className="text-xs text-muted-foreground">{promo.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaderboard"
            className="p-2 rounded-full hover:bg-secondary transition"
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {standings.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No qualifying participants yet. Be the first on the board!
            </p>
          ) : (
            standings.map((part) => {
              const isMe = part.userId === userId;
              return (
                <div
                  key={part.userId}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    isMe
                      ? "bg-primary/10 border-primary/30"
                      : part.isWinner
                      ? "bg-amber-500/5 border-amber-500/20"
                      : "bg-secondary/30 border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`font-bold w-6 text-center ${
                        part.isWinner ? "text-amber-500" : "text-muted-foreground"
                      }`}
                    >
                      {part.rank}
                    </span>
                    <div>
                      <p
                        className={`text-sm font-semibold ${
                          isMe ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {part.name} {isMe && "(You)"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatScore(part.progress)}
                      </p>
                    </div>
                  </div>
                  {part.isWinner && (
                    <span className="text-[10px] font-bold uppercase text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md">
                      {part.prize > 0 ? NGN.format(part.prize) : "Winner"}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
