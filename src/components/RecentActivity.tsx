import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface TxRow {
  id: string;
  type: string;
  amount: number;
  reference?: string | null;
  created_at: string;
  status?: string | null;
}

interface RecentActivityProps {
  userId: string | undefined;
  hideRecentTx?: boolean;
  limit?: number;
}

function normalizeTxRow(row: any): TxRow {
  return {
    id: String(row.id),
    type: String(row.type || "transaction"),
    amount: Number(row.amount ?? 0),
    reference: row.reference ? String(row.reference) : null,
    created_at: String(row.created_at || new Date().toISOString()),
    status: row.status ?? null,
  };
}

function mergeTxRows(
  current: TxRow[],
  incoming: TxRow[],
  maxItems: number,
): TxRow[] {
  const map = new Map<string, TxRow>();

  for (const row of [...incoming, ...current]) {
    const key = row.reference ? `ref:${row.reference}` : `id:${row.id}`;
    const existing = map.get(key);
    map.set(key, existing ? { ...existing, ...row } : row);
  }

  return Array.from(map.values())
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, maxItems);
}

export function RecentActivity({
  userId,
  hideRecentTx = false,
  limit = 5,
}: RecentActivityProps) {
  const queryClient = useQueryClient();
  const [freshIds, setFreshIds] = useState<Record<string, boolean>>({});
  const freshTimersRef = useRef<Record<string, number>>({});

  const markFresh = useCallback((id: string) => {
    setFreshIds((prev) => ({ ...prev, [id]: true }));

    if (freshTimersRef.current[id] !== undefined) {
      window.clearTimeout(freshTimersRef.current[id]);
    }

    freshTimersRef.current[id] = window.setTimeout(() => {
      setFreshIds((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete freshTimersRef.current[id];
    }, 4500);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(freshTimersRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      freshTimersRef.current = {};
    };
  }, []);

  const { data: recent = [] } = useQuery({
    queryKey: ["recent-tx", userId],
    enabled: !!userId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, amount, reference, created_at, status")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data as any[]) ?? []).map(normalizeTxRow);
    },
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-recent-tx-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!payload.new) return;
          const incoming = normalizeTxRow(payload.new);

          queryClient.setQueryData<TxRow[]>(["recent-tx", userId], (old = []) =>
            mergeTxRows(old, [incoming], limit),
          );

          markFresh(incoming.id);
          void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!payload.new) return;
          const updated = normalizeTxRow(payload.new);

          queryClient.setQueryData<TxRow[]>(["recent-tx", userId], (old = []) =>
            mergeTxRows(old, [updated], limit),
          );

          void queryClient.invalidateQueries({ queryKey: ["wallet", userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, limit, queryClient, markFresh]);

  if (hideRecentTx) {
    return (
      <section className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 text-center text-sm text-slate-400">
        Recent transactions are hidden.{" "}
        <Link
          to="/privacy"
          className="text-cyan-400 hover:underline font-medium"
        >
          Manage in Privacy Settings
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Recent activity
        </h2>
        <Link
          to="/transactions"
          className="text-xs font-semibold text-cyan-400 hover:underline"
        >
          See all
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 text-center text-sm text-slate-400">
          No transactions yet. Start with a top-up.
        </div>
      ) : (
        <ul className="space-y-2.5">
          {recent.map((tx) => {
            const isFresh = Boolean(freshIds[tx.id]);
            const isPositive = tx.amount >= 0;

            return (
              <li
                key={tx.id}
                className={`rounded-2xl border flex items-center justify-between p-3.5 shadow-inner transition-colors duration-500 ${
                  isFresh
                    ? "bg-emerald-950/35 border-emerald-500/40"
                    : "bg-slate-900/70 border-slate-800/80"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold capitalize text-slate-200">
                      {tx.type.replace("_", " ")}
                    </p>
                    {isFresh && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(tx.created_at).toLocaleString()}
                  </p>
                </div>

                <p
                  className={`text-sm font-bold ${
                    isPositive ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {isPositive ? "+" : "-"}₦
                  {Math.abs(tx.amount).toLocaleString("en-NG", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
