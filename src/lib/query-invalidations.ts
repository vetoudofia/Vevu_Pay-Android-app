// src/lib/query-invalidations.ts
import type { QueryClient } from "@tanstack/react-query";

export async function invalidateAfterPurchase(
  queryClient: QueryClient,
  userId?: string | null,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: userId
        ? ["active-or-recent-promo", userId]
        : ["active-or-recent-promo"],
    }),
    queryClient.invalidateQueries({
      queryKey: userId ? ["wallet", userId] : ["wallet"],
    }),
    queryClient.invalidateQueries({
      queryKey: userId ? ["recent-tx", userId] : ["recent-tx"],
    }),
  ]);
}
