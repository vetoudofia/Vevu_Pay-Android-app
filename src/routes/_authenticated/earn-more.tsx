import { createFileRoute } from "@tanstack/react-router";
import { Gift, Sparkles, Clock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_authenticated/earn-more")({
  head: () => ({ meta: [{ title: "Earn More — VevuPay" }] }),
  component: EarnMorePlaceholder,
});

function EarnMorePlaceholder() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <PageHeader
        eyebrow="Rewards"
        title="Earn More"
        subtitle="Exciting ways to earn are on the way!"
      />

      <div className="surface p-8 text-center rounded-2xl border border-dashed border-primary/30">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-primary/10">
            <Gift className="h-12 w-12 text-primary" />
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Coming Soon!
          <Sparkles className="h-5 w-5 text-yellow-500" />
        </h2>

        <p className="text-muted-foreground max-w-sm mx-auto">
          We're working on exciting new ways for you to earn rewards, bonuses, and cashback. 
          Stay tuned for updates!
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Launching soon – we'll notify you!</span>
        </div>

        <div className="mt-6 p-4 rounded-lg bg-secondary/30 text-xs text-muted-foreground">
          💡 In the meantime, check out our <strong>Referrals</strong> page to earn coupons by inviting friends!
        </div>
      </div>
    </div>
  );
}
