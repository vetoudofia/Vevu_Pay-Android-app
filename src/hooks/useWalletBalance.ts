import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WalletRecord {
  id: string;
  profile_id: string;
  balance: number;
  updated_at?: string;
}

export function useWalletBalance(userId: string | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!userId) {
      setWallet(null);
      setBalance(0);
      setError(null);
      setIsLoading(false);
      return;
    }

    setError(null);

    const { data, error: fetchError } = await supabase
      .from("wallets")
      .select("id, profile_id, balance, updated_at")
      .eq("profile_id", userId)
      .maybeSingle();

    if (fetchError) {
      setError(fetchError.message);
      setIsLoading(false);
      return;
    }

    if (data) {
      const normalized: WalletRecord = {
        ...data,
        balance: Number(data.balance ?? 0),
      };
      setWallet(normalized);
      setBalance(normalized.balance);
    } else {
      setWallet(null);
      setBalance(0);
    }

    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    setIsLoading(true);
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallets-profile-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wallets",
          filter: `profile_id=eq.${userId}`,
        },
        (payload) => {
          const nextRow = payload.new as Partial<WalletRecord> | undefined;

          if (nextRow && nextRow.balance !== undefined) {
            const numericBalance = Number(nextRow.balance ?? 0);
            setBalance(numericBalance);
            setWallet((prev) =>
              prev
                ? { ...prev, ...nextRow, balance: numericBalance }
                : (nextRow as WalletRecord),
            );
          } else {
            fetchBalance();
          }
        },
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchBalance();
      }
    };

    window.addEventListener("focus", fetchBalance);
    window.addEventListener("online", fetchBalance);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", fetchBalance);
      window.removeEventListener("online", fetchBalance);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchBalance]);

  return {
    balance,
    wallet,
    isLoading,
    error,
    refetch: fetchBalance,
  };
}
