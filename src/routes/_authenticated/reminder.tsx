// src/routes/_authenticated/reminders.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { Bell, Plus, BellRing, BellOff } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/reminder")({
  component: RemindersPage,
});

function RemindersPage() {
  const { user } = useAuth();

  const { data: reminders, refetch } = useQuery({
    queryKey: ["reminders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("next_run", { ascending: true });
      return data || [];
    },
  });

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    await supabase
      .from("reminders")
      .update({ status: newStatus })
      .eq("id", id);
    refetch();
  };

  const deleteReminder = async (id: string) => {
    if (confirm("Delete this reminder?")) {
      await supabase
        .from("reminders")
        .update({ status: "cancelled" })
        .eq("id", id);
      refetch();
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Reminders</h1>
        <Link
          to="/create-reminder"
          className="flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
        >
          <Plus className="h-4 w-4" /> New
        </Link>
      </div>

      {!reminders || reminders.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔔</div>
          <h3 className="text-lg font-semibold mb-2">No Reminders</h3>
          <p className="text-sm text-muted-foreground">
            Create reminders to help you remember important financial tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((r) => (
            <div key={r.id} className="bg-secondary/20 p-4 rounded-xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {r.status === "active" ? (
                      <BellRing className="h-4 w-4 text-primary" />
                    ) : (
                      <BellOff className="h-4 w-4 text-muted-foreground" />
                    )}
                    <h3 className="font-semibold">{r.title}</h3>
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground">{r.description}</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {r.amount && (
                      <span className="text-sm font-medium">₦{Number(r.amount).toLocaleString()}</span>
                    )}
                    {r.service_type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600">
                        {r.service_type}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Next: {format(new Date(r.next_run), "PPP p")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => toggleStatus(r.id, r.status)}
                    className="p-2 rounded-lg hover:bg-secondary/30"
                  >
                    {r.status === "active" ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
