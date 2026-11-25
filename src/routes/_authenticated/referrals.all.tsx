// src/routes/_authenticated/referrals.all.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, AlertCircle, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

interface Referral {
  id: string;
  referred_user_email?: string | null;
  bonus: number;
  created_at: string;
  referred_user_id?: string;
  referrer_id: string;
  first_purchase_paid?: boolean;
}

const PAGE_SIZE = 20;

export const Route = createFileRoute("/_authenticated/referrals/all")({
  head: () => ({ meta: [{ title: "All Referrals — VevuPay" }] }),
  component: AllReferralsPage,
});

function AllReferralsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // ─── Fetch Paginated Referrals ──────────────────────────────
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ["referrals", "all", user?.id],
    enabled: !!user,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("referrals")
        .select("id, referred_user_email, bonus, created_at, referred_user_id, referrer_id, first_purchase_paid")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return data as Referral[];
    },
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has exactly 20 items, there might be more. 
      // Otherwise, we've reached the end.
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
  });

  // Flatten all pages into a single array for rendering
  const allReferrals = data?.pages.flat() || [];

  // ─── Loading State ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 min-h-screen">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading all referrals...</span>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <button
          onClick={() => navigate({ to: "/referrals" })}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Referrals
        </button>
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-destructive">Failed to load referrals</h3>
          <p className="text-sm text-muted-foreground mt-1">Please try again later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => navigate({ to: "/referrals" })}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition w-fit"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight">All Referrals</h1>
        <p className="text-sm text-muted-foreground">
          Complete history of everyone who signed up using your code.
        </p>
      </div>

      {/* List */}
      {allReferrals.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 dark:bg-gray-700">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No referrals yet</p>
          <p className="text-xs text-muted-foreground">Share your code to start building your list.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2">
            {allReferrals.map((r) => (
              <li
                key={r.id}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-r from-blue-500 to-green-500 text-sm font-bold text-white">
                    {r.referred_user_email
                      ? r.referred_user_email.charAt(0).toUpperCase()
                      : "U"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {r.referred_user_email || "Anonymous User"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Joined{" "}
                      {new Date(r.created_at).toLocaleDateString("en-NG", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {r.first_purchase_paid ? (
                    <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-500 rounded-full">
                      ✓ Bonus Paid
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
                      Awaiting Purchase
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Load More Button */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading more...
                  </>
                ) : (
                  "Load More"
                )}
              </button>
            </div>
          )}

          {!hasNextPage && allReferrals.length > 0 && (
            <p className="text-center text-xs text-muted-foreground pt-4 pb-8">
              You've reached the end of your referral list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
