// src/routes/_authenticated/notifications.tsx

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Capacitor } from "@capacitor/core";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import { enableAndroidPushNotifications } from "@/native/device-registration";

import {
  Bell,
  CheckCheck,
  Loader2,
  ArrowLeft,
  Gift,
  Receipt,
  AlertTriangle,
  Info,
  ShieldCheck,
  UserRound,
  Megaphone,
  Wrench,
  Wifi,
  BadgeCheck,
  Wallet,
  CircleDollarSign,
  Clock,
  Mail,
  Smartphone,
} from "lucide-react";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [{ title: "Notifications — VevuPay" }],
  }),
  component: NotificationsPage,
});

interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  category?: string;
  email_required?: boolean;
  email_status?: string;
  created_at: string;
}

type NotificationIcon = {
  icon: typeof Bell;
  color: string;
  background: string;
};

function getNotificationIcon(
  notification: Notification
): NotificationIcon {
  const title = notification.title.toLowerCase();
  const category = (notification.category || "general").toLowerCase();

  // Security notifications
  if (
    category === "security" ||
    title.includes("password") ||
    title.includes("pin change") ||
    title.includes("pin reset") ||
    title.includes("security") ||
    title.includes("login alert") ||
    title.includes("unauthorized")
  ) {
    return {
      icon: ShieldCheck,
      color: "text-blue-500",
      background: "bg-blue-500/10",
    };
  }

  // Account notifications
  if (
    category === "account" ||
    title.includes("account updated") ||
    title.includes("account update") ||
    title.includes("profile")
  ) {
    return {
      icon: UserRound,
      color: "text-indigo-500",
      background: "bg-indigo-500/10",
    };
  }

  // Verification notifications
  if (
    category === "verification" ||
    title.includes("verification") ||
    title.includes("verified") ||
    title.includes("bvn") ||
    title.includes("identity")
  ) {
    return {
      icon: BadgeCheck,
      color: "text-green-500",
      background: "bg-green-500/10",
    };
  }

  // Referral and rewards
  if (
    category === "referral" ||
    category === "cashback" ||
    title.includes("cashback") ||
    title.includes("bonus") ||
    title.includes("referral") ||
    title.includes("reward") ||
    title.includes("🎁")
  ) {
    return {
      icon: Gift,
      color: "text-yellow-500",
      background: "bg-yellow-500/10",
    };
  }

  // Promotions
  if (
    category === "promotion" ||
    title.includes("promotion") ||
    title.includes("discount") ||
    title.includes("special offer") ||
    title.includes("coupon")
  ) {
    return {
      icon: Megaphone,
      color: "text-purple-500",
      background: "bg-purple-500/10",
    };
  }

  // Maintenance
  if (
    category === "maintenance" ||
    title.includes("maintenance") ||
    title.includes("scheduled update")
  ) {
    return {
      icon: Wrench,
      color: "text-orange-500",
      background: "bg-orange-500/10",
    };
  }

  // Service status
  if (
    category === "service" ||
    title.includes("service interruption") ||
    title.includes("service restored") ||
    title.includes("service unavailable") ||
    title.includes("service update")
  ) {
    return {
      icon: Wifi,
      color: "text-cyan-500",
      background: "bg-cyan-500/10",
    };
  }

  // Wallet notifications
  if (
    title.includes("wallet") ||
    title.includes("funding") ||
    title.includes("deposit")
  ) {
    return {
      icon: Wallet,
      color: "text-green-500",
      background: "bg-green-500/10",
    };
  }

  // Refunds and failed transactions
  if (
    title.includes("refund") ||
    title.includes("failed") ||
    title.includes("reversed")
  ) {
    return {
      icon: AlertTriangle,
      color: "text-destructive",
      background: "bg-destructive/10",
    };
  }

  // Purchases and transactions
  if (
    category === "transaction" ||
    title.includes("purchase") ||
    title.includes("completed") ||
    title.includes("successful") ||
    title.includes("transaction")
  ) {
    return {
      icon: Receipt,
      color: "text-green-500",
      background: "bg-green-500/10",
    };
  }

  // Financial rewards
  if (
    title.includes("payment") ||
    title.includes("credited") ||
    title.includes("received")
  ) {
    return {
      icon: CircleDollarSign,
      color: "text-emerald-500",
      background: "bg-emerald-500/10",
    };
  }

  // General notifications
  return {
    icon: Info,
    color: "text-primary",
    background: "bg-primary/10",
  };
}

function getCategoryLabel(category?: string) {
  const labels: Record<string, string> = {
    general: "General",
    security: "Security",
    account: "Account",
    verification: "Verification",
    referral: "Referral",
    cashback: "Cashback",
    promotion: "Promotion",
    maintenance: "Maintenance",
    service: "Service update",
    transaction: "Transaction",
  };

  return labels[(category || "general").toLowerCase()] || "Notification";
}

function getDateLabel(dateString: string): string {
  const date = new Date(dateString);

  const today = new Date();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-NG", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() !== today.getFullYear()
        ? "numeric"
        : undefined,
  });
}

function NotificationsPage() {
  const { user } = useAuth();

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const [markingAll, setMarkingAll] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);

  const [markingIds, setMarkingIds] = useState<string[]>([]);

  const notificationQueryKey = ["notifications", user?.id];

  const unreadQueryKey = ["unread-notifications", user?.id];

  // Fetch notifications belonging to the signed-in user.
  const {
    data: notifications,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: notificationQueryKey,

    enabled: !!user,

    queryFn: async () => {
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      return (data || []) as Notification[];
    },

    staleTime: 30_000,

    refetchOnWindowFocus: true,
  });

  const unreadCount =
    notifications?.filter((notification) => !notification.read).length ??
    0;

  // Mark an individual notification as read.
  const markAsRead = async (id: string) => {
    if (!user) return false;

    setMarkingIds((previous) => [...previous, id]);

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id)
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) {
        throw error;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notificationQueryKey,
        }),

        queryClient.invalidateQueries({
          queryKey: unreadQueryKey,
        }),
      ]);

      return true;
    } catch (error) {
      console.error("Mark notification as read error:", error);

      toast.error("Could not mark notification as read");

      return false;
    } finally {
      setMarkingIds((previous) =>
        previous.filter((item) => item !== id)
      );
    }
  };

  // Mark all unread notifications as read.
  const markAllRead = async () => {
    if (!user || unreadCount === 0 || markingAll) {
      return;
    }

    setMarkingAll(true);

    try {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) {
        throw error;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: notificationQueryKey,
        }),

        queryClient.invalidateQueries({
          queryKey: unreadQueryKey,
        }),
      ]);

      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Mark all notifications error:", error);

      toast.error("Failed to mark all notifications as read");
    } finally {
      setMarkingAll(false);
    }
  };

  // Handle notification clicks.
  const handleNotificationClick = async (
    notification: Notification
  ) => {
    if (!notification.read) {
      const success = await markAsRead(notification.id);

      if (!success) {
        return;
      }
    }

    // Only navigate to internal application routes.
    if (
      notification.link &&
      notification.link.startsWith("/") &&
      !notification.link.startsWith("//")
    ) {
      navigate({
        to: notification.link as "/dashboard",
      });
    }
  };

  // Group notifications by date.
  const grouped = (notifications || []).reduce(
    (acc, notification) => {
      const label = getDateLabel(notification.created_at);

      if (!acc[label]) {
        acc[label] = [];
      }

      acc[label].push(notification);

      return acc;
    },
    {} as Record<string, Notification[]>
  );

  // Loading state.
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PageHeader title="Notifications" />

        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // Error state.
  if (isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <PageHeader title="Notifications" />

        <div className="surface p-10 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto mb-3" />

          <p className="text-sm font-semibold">
            Unable to load notifications
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            Please check your internet connection and try again.
          </p>

          <button
            onClick={() => refetch()}
            className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">

        <div className="flex items-center gap-3">

          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="rounded-full p-2 hover:bg-secondary transition"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div>
            <h1 className="text-2xl font-bold">
              Notifications
            </h1>

            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {unreadCount} unread
              </p>
            )}

            {unreadCount === 0 && (
              <p className="text-xs text-muted-foreground">
                You're all caught up
              </p>
            )}
          </div>

        </div>

        <div className="flex items-center gap-3">
          {Capacitor.isNativePlatform() && (
            <button
              type="button"
              disabled={enablingPush}
              onClick={async () => {
                setEnablingPush(true);
                try {
                  const result = await enableAndroidPushNotifications();
                  if (result.enabled) {
                    toast.success("Push notifications enabled on this device.");
                  } else {
                    toast.error(result.reason || "Could not enable push notifications.");
                  }
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not enable push notifications.",
                  );
                } finally {
                  setEnablingPush(false);
                }
              }}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
            >
              {enablingPush ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
              Enable alerts
            </button>
          )}

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
            >
              {markingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}

              {markingAll ? "Marking..." : "Mark all read"}
            </button>
          )}
        </div>

      </div>

      {/* Empty state */}
      {!notifications || notifications.length === 0 ? (

        <div className="surface p-10 text-center">

          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-8 w-8 text-primary" />
          </div>

          <p className="text-sm font-semibold">
            No notifications yet
          </p>

          <p className="text-xs text-muted-foreground mt-2 max-w-xs mx-auto">
            You'll receive important updates about your account,
            security, referrals, rewards, promotions and VevuPay services
            here.
          </p>

        </div>

      ) : (

        <div className="space-y-6">

          {Object.entries(grouped).map(([label, items]) => (

            <section key={label}>

              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </h2>

              <ul className="space-y-2">

                {items.map((notification) => {

                  const notificationIcon =
                    getNotificationIcon(notification);

                  const Icon = notificationIcon.icon;

                  const isMarking = markingIds.includes(
                    notification.id
                  );

                  return (

                    <li
                      key={notification.id}
                      onClick={() =>
                        !isMarking &&
                        handleNotificationClick(notification)
                      }
                      className={`
                        surface p-4 transition
                        ${
                          notification.link
                            ? "cursor-pointer hover:border-primary/40"
                            : ""
                        }
                        ${
                          !notification.read
                            ? "border-l-4 border-l-primary"
                            : ""
                        }
                      `}
                    >

                      <div className="flex items-start gap-3">

                        {/* Notification icon */}
                        <div
                          className={`
                            mt-0.5 shrink-0 rounded-xl p-2.5
                            ${
                              !notification.read
                                ? notificationIcon.background
                                : "bg-secondary/50"
                            }
                          `}
                        >
                          <Icon
                            className={`
                              h-5 w-5
                              ${
                                !notification.read
                                  ? notificationIcon.color
                                  : "text-muted-foreground"
                              }
                            `}
                          />
                        </div>

                        {/* Notification content */}
                        <div className="flex-1 min-w-0">

                          <div className="flex items-start justify-between gap-2">

                            <p
                              className={`
                                text-sm
                                ${
                                  !notification.read
                                    ? "font-bold"
                                    : "font-medium"
                                }
                              `}
                            >
                              {notification.title}
                            </p>

                            <div className="flex shrink-0 items-center gap-2">

                              {isMarking && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                              )}

                              {!notification.read && !isMarking && (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              )}

                            </div>

                          </div>

                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap break-words">
                            {notification.message}
                          </p>

                          {/* Category and timestamp */}
                          <div className="mt-3 flex items-center justify-between gap-2">

                            <span className="inline-flex items-center rounded-full bg-secondary/70 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {getCategoryLabel(notification.category)}
                            </span>

                            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="h-3 w-3" />

                              {new Date(
                                notification.created_at
                              ).toLocaleTimeString("en-NG", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>

                          </div>

                        </div>

                      </div>

                    </li>

                  );

                })}

              </ul>

            </section>

          ))}

        </div>

      )}

      {/* Footer */}
      {notifications && notifications.length > 0 && (
        <div className="mt-8 border-t border-border pt-5 text-center">

          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />

            <p className="text-[10px]">
              Important account notifications may also be sent to your email.
            </p>
          </div>

          <p className="mt-2 text-[10px] text-muted-foreground">
            Showing your latest {notifications.length} notifications.
          </p>

        </div>
      )}

    </div>
  );
}
