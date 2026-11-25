// src/routes/_authenticated/capsules.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Gift, Clock, CheckCircle, XCircle, Plus, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/capsules")({
  head: () => ({
    meta: [
      { title: "Money Capsules — Gift money that unlocks later | VevuPay" },
      {
        name: "description",
        content:
          "Send and receive money capsules that stay locked until a special date, then unlock straight into the wallet.",
      },
      { property: "og:title", content: "VevuPay Money Capsules" },
      {
        property: "og:description",
        content: "Time-locked money gifts for birthdays, weddings and milestones.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CapsulesDashboard,
});

type Capsule = {
  id: string;
  amount: number;
  status: string;
  occasion: string | null;
  unlock_date: string;
  show_amount_before_unlock?: boolean;
  sender_id: string;
  recipient_id: string;
};

const STATUS = {
  locked: { label: "Locked", icon: Clock, cls: "bg-warning/15 text-warning" },
  unlocked: { label: "Unlocked", icon: CheckCircle, cls: "bg-success/15 text-success" },
  cancelled: { label: "Cancelled", icon: XCircle, cls: "bg-destructive/15 text-destructive" },
} as const;

function StatusChip({ status }: { status: string }) {
  const meta = STATUS[status as keyof typeof STATUS] ?? {
    label: status,
    icon: Gift,
    cls: "bg-secondary/50 text-muted-foreground",
  };
  const Icon = meta.icon;
  return (
    <span className={`chip ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function CapsulesDashboard() {
  const { user } = useAuth();

  const { data: sent } = useQuery({
    queryKey: ["capsules-sent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("money_capsules")
        .select("*")
        .eq("sender_id", user!.id)
        .order("created_at", { ascending: false });
      return (data || []) as Capsule[];
    },
  });

  const { data: received } = useQuery({
    queryKey: ["capsules-received", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("money_capsules")
        .select("*")
        .eq("recipient_id", user!.id)
        .order("created_at", { ascending: false });
      return (data || []) as Capsule[];
    },
  });

  const isEmpty = !sent?.length && !received?.length;

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <PageHeader
        eyebrow="Money Capsules"
        title="Gifts that wait"
        subtitle="Lock money now, let it unlock on the big day."
        backTo="/dashboard"
        action={
          <Link to="/create-capsule" className="btn-primary px-3 py-2 text-xs">
            <Plus className="h-4 w-4" /> New
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="surface p-4">
          <p className="text-2xl font-bold">{received?.length || 0}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Received</p>
        </div>
        <div className="surface p-4">
          <p className="text-2xl font-bold">{sent?.length || 0}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sent</p>
        </div>
      </div>

      {isEmpty && (
        <div className="surface mt-5 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/15 text-accent">
            <Gift className="h-6 w-6" />
          </span>
          <h2 className="mt-3 text-base font-semibold">No capsules yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a money capsule to surprise someone on a special occasion.
          </p>
          <Link to="/create-capsule" className="btn-primary mt-4 w-full">
            <Plus className="h-4 w-4" /> Create a capsule
          </Link>
        </div>
      )}

      {!!received?.length && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Received
          </h2>
          <div className="space-y-2">
            {received.slice(0, 5).map((capsule) => (
              <Link
                key={capsule.id}
                to={`/capsule/${capsule.id}`}
                className="surface flex items-center gap-3 p-4 transition hover:border-primary/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Gift className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {capsule.show_amount_before_unlock || capsule.status === "unlocked"
                      ? `₦${Number(capsule.amount).toLocaleString()}`
                      : "Amount hidden"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {capsule.occasion || "No occasion"}
                    {capsule.status === "locked" &&
                      ` · unlocks in ${formatDistanceToNow(new Date(capsule.unlock_date))}`}
                  </p>
                </div>
                <StatusChip status={capsule.status} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {!!sent?.length && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sent
          </h2>
          <div className="space-y-2">
            {sent.slice(0, 5).map((capsule) => (
              <div key={capsule.id} className="surface flex items-center gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <Gift className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    ₦{Number(capsule.amount).toLocaleString()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {capsule.occasion || "No occasion"}
                    {capsule.status === "locked" &&
                      ` · unlocks ${format(new Date(capsule.unlock_date), "d MMM yyyy")}`}
                  </p>
                </div>
                <StatusChip status={capsule.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
