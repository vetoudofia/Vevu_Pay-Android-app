// src/routes/_authenticated/create-capsule.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Calendar, Gift } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_authenticated/create-capsule")({
  component: CreateCapsule,
});

function CreateCapsule() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [occasion, setOccasion] = useState("");
  const [message, setMessage] = useState("");
  const [theme, setTheme] = useState("default");
  const [showAmount, setShowAmount] = useState(false);
  const [allowCancel, setAllowCancel] = useState(true);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const themes = [
    { value: "default", label: "Default" },
    { value: "birthday", label: "🎂 Birthday" },
    { value: "christmas", label: "🎄 Christmas" },
    { value: "new_year", label: "🎉 New Year" },
    { value: "wedding", label: "💍 Wedding" },
    { value: "graduation", label: "🎓 Graduation" },
    { value: "valentine", label: "❤️ Valentine" },
    { value: "anniversary", label: "💕 Anniversary" },
  ];

  const occasions = [
    "Birthday",
    "Christmas",
    "New Year",
    "Wedding",
    "Graduation",
    "Baby Shower",
    "Anniversary",
    "Personal Surprise",
    "Other",
  ];

  const searchUsers = async (query: string) => {
    if (query.length < 2) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, vevu_id")
      .ilike("full_name", `%${query}%`)
      .limit(5);
    setSearchResults(data || []);
    setSearching(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!selectedRecipient) {
        toast.error("Please select a recipient");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-capsule", {
        body: {
          recipient_id: selectedRecipient.id,
          amount: parseFloat(amount),
          unlock_date: new Date(unlockDate).toISOString(),
          occasion: occasion || null,
          message: message || null,
          theme,
          show_amount_before_unlock: showAmount,
          allow_cancel: allowCancel,
        },
      });

      if (error) throw error;
      if (data.success) {
        toast.success(data.message || "Capsule sent!");
        navigate({ to: "/capsules" });
      } else {
        toast.error(data.error || "Failed to send capsule");
      }
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">🎁 Money Capsule</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Send money that unlocks on a special date.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Recipient</label>
          <input
            placeholder="Search by name or email"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              searchUsers(e.target.value);
            }}
            className="w-full px-4 py-2 border rounded-lg bg-background"
          />
          {searching && <p className="text-xs text-muted-foreground mt-1">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-1 border rounded-lg bg-background">
              {searchResults.map(user => (
                <div
                  key={user.id}
                  className="px-3 py-2 hover:bg-secondary/20 cursor-pointer flex justify-between items-center"
                  onClick={() => {
                    setSelectedRecipient(user);
                    setRecipient(user.full_name + " (" + user.email + ")");
                    setSearchResults([]);
                  }}
                >
                  <span>{user.full_name}</span>
                  <span className="text-xs text-muted-foreground">{user.vevu_id}</span>
                </div>
              ))}
            </div>
          )}
          {selectedRecipient && (
            <p className="text-xs text-green-600 mt-1">✅ Selected: {selectedRecipient.full_name}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Amount (₦) *</label>
          <input
            type="number"
            placeholder="50000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg bg-background"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Unlock Date & Time *</label>
          <input
            type="datetime-local"
            value={unlockDate}
            onChange={(e) => setUnlockDate(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg bg-background"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Occasion (optional)</label>
          <select
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg bg-background"
          >
            <option value="">Select an occasion</option>
            {occasions.map(occ => (
              <option key={occ} value={occ}>{occ}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Theme</label>
          <div className="grid grid-cols-4 gap-2">
            {themes.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTheme(t.value)}
                className={`px-2 py-2 rounded-lg text-xs transition ${
                  theme === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/20 hover:bg-secondary/30"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Personal Message</label>
          <textarea
            placeholder="Write a personal message for the recipient..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg bg-background resize-none"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showAmount"
              checked={showAmount}
              onChange={(e) => setShowAmount(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="showAmount" className="text-sm">
              Show amount before unlock
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowCancel"
              checked={allowCancel}
              onChange={(e) => setAllowCancel(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="allowCancel" className="text-sm">
              Allow sender to cancel before unlock
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !selectedRecipient}
          className="w-full py-3 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
          {loading ? "Sending..." : "Send Money Capsule"}
        </button>
      </form>
    </div>
  );
}
