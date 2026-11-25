// src/components/NotificationBell.tsx
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("read", false);
      if (error) return 0;
      return count || 0;
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user) return;
    const refreshUnreadCount = () => {
      void queryClient.invalidateQueries({
        queryKey: ["unread-notifications", user.id],
      });
    };

    window.addEventListener("vevupay:push-received", refreshUnreadCount);

    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["unread-notifications", user.id] });
        }
      )
      .subscribe();
    return () => {
      window.removeEventListener("vevupay:push-received", refreshUnreadCount);
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return (
    <Link
      to="/notifications"
      className="relative rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}
