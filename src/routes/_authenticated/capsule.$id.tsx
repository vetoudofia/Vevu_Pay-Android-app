// src/routes/_authenticated/capsule.$id.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Gift, Clock, Calendar, User, X, Lock } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/capsule/$id")({
  component: CapsuleDetail,
});

function CapsuleDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cancelling, setCancelling] = useState(false);

  const { data: capsule, refetch } = useQuery({
    queryKey: ["capsule", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("money_capsules")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: sender } = useQuery({
    queryKey: ["capsule-sender", capsule?.sender_id],
    enabled: !!capsule,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, vevu_id")
        .eq("id", capsule.sender_id)
        .single();
      return data;
    },
  });

  const { data: recipient } = useQuery({
    queryKey: ["capsule-recipient", capsule?.recipient_id],
    enabled: !!capsule,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, vevu_id")
        .eq("id", capsule.recipient_id)
        .single();
      return data;
    },
  });

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this capsule? The money will be refunded to your wallet.")) {
      return;
    }
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-capsule", {
        body: { capsule_id: id },
      });
      if (error) throw error;
      if (data.success) {
        toast.success(data.message);
        refetch();
      } else {
        toast.error(data.error || "Failed to cancel capsule");
      }
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    } finally {
      setCancelling(false);
    }
  };

  if (!capsule) return <div className="p-4">Loading...</div>;

  const isSender = user?.id === capsule.sender_id;
  const isRecipient = user?.id === capsule.recipient_id;
  const isLocked = capsule.status === "locked";
  const canCancel = isSender && isLocked && capsule.allow_cancel;
  const canShowAmount = capsule.show_amount_before_unlock || capsule.status !== "locked";

  const themeEmojis: Record<string, string> = {
    default: "🎁",
    birthday: "🎂",
    christmas: "🎄",
    new_year: "🎉",
    wedding: "💍",
    graduation: "🎓",
    valentine: "❤️",
    anniversary: "💕",
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <button onClick={() => navigate({ to: "/capsules" })} className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="bg-secondary/20 p-6 rounded-2xl text-center mb-4">
        <div className="text-6xl mb-3">{themeEmojis[capsule.theme] || "🎁"}</div>
        <h1 className="text-2xl font-bold">
          {capsule.occasion || "Money Capsule"}
        </h1>
        {capsule.message && (
          <p className="text-sm text-muted-foreground mt-2 italic">"{capsule.message}"</p>
        )}
        <div className="mt-3 flex justify-center gap-4 text-sm">
          <span className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {isSender ? "You" : sender?.full_name || "Unknown"}
            {!isSender && " →"}
          </span>
          {!isSender && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {recipient?.full_name || "Unknown"}
            </span>
          )}
        </div>
      </div>

      <div className="bg-secondary/20 p-4 rounded-xl mb-4">
        <div className="flex justify-between py-1">
          <span className="text-muted-foreground">Status</span>
          <span className={`font-medium capitalize ${
            capsule.status === "locked" ? "text-yellow-500" :
            capsule.status === "unlocked" ? "text-green-500" :
            "text-red-500"
          }`}>
            {capsule.status}
          </span>
        </div>
        <div className="flex justify-between py-1 border-t border-border">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-medium">
            {canShowAmount ? `₦${Number(capsule.amount).toLocaleString()}` : "🔒 Hidden"}
          </span>
        </div>
        <div className="flex justify-between py-1 border-t border-border">
          <span className="text-muted-foreground">Unlock Date</span>
          <span className="font-medium">{format(new Date(capsule.unlock_date), "PPP p")}</span>
        </div>
        {capsule.status === "locked" && (
          <div className="flex justify-between py-1 border-t border-border">
            <span className="text-muted-foreground">Time Left</span>
            <span className="font-medium text-yellow-500">
              {formatDistanceToNow(new Date(capsule.unlock_date))}
            </span>
          </div>
        )}
        {capsule.unlocked_at && (
          <div className="flex justify-between py-1 border-t border-border">
            <span className="text-muted-foreground">Unlocked At</span>
            <span className="font-medium">{format(new Date(capsule.unlocked_at), "PPP p")}</span>
          </div>
        )}
      </div>

      {isLocked && isRecipient && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl text-center mb-4">
          <Lock className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
          <p className="font-semibold">This capsule is locked</p>
          <p className="text-sm text-muted-foreground">
            It will unlock on {format(new Date(capsule.unlock_date), "PPP")}
          </p>
        </div>
      )}

      {capsule.status === "unlocked" && (
        <div className="bg-green-500/10 border border-green-500/30 p-4 rounded-xl text-center mb-4">
          <Gift className="h-8 w-8 text-green-500 mx-auto mb-2" />
          <p className="font-semibold text-green-600">🎉 Capsule Unlocked!</p>
          <p className="text-sm text-muted-foreground">
            {isRecipient ? "The money has been added to your wallet." : "The recipient has received the money."}
          </p>
        </div>
      )}

      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-3 bg-destructive text-destructive-foreground rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          {cancelling ? "Cancelling..." : "Cancel Capsule"}
        </button>
      )}
    </div>
  );
}
