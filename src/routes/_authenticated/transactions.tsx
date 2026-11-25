// src/routes/_authenticated/transactions.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  X, Search, ArrowDownLeft, ArrowUpRight, Receipt,
  Filter, Loader2, Download, ArrowDownCircle, ArrowUpCircle,
  CheckCircle2, XCircle, Clock, Info, Gift, ShieldCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/PageHeader";
import logo from "@/assets/vevupay-logo.png.asset.json";
import { toast } from "sonner";
import { toPng } from "html-to-image";

interface Tx {
  id: string;
  type: string;
  amount: number | string;
  created_at: string;
  status?: string | null;
  reference?: string | null;
  recipient?: string | null;
  notification_message?: string | null;
  balance_before?: number | string | null;
  balance_after?: number | string | null;
  meta?: any;
  metadata?: any;
}

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({ meta: [{ title: "Transactions — VevuPay" }] }),
  component: TransactionsPage,
});

type StatusFilter = "all" | "success" | "pending" | "failed";
type DateFilter = "all" | "today" | "7days" | "30days";
type ServiceFilter =
  | "all"
  | "data"
  | "airtime"
  | "tv"
  | "electricity"
  | "bet"
  | "education"
  | "cashback"
  | "referral_bonus"
  | "signup_bonus"
  | "transfer_sent"
  | "transfer_received";

const SERVICE_FILTERS: { value: ServiceFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "transfer_sent", label: "Transfer Sent" },
  { value: "transfer_received", label: "Transfer Received" },
  { value: "data", label: "Data" },
  { value: "airtime", label: "Airtime" },
  { value: "tv", label: "Cable TV" },
  { value: "electricity", label: "Electricity" },
  { value: "bet", label: "Betting" },
  { value: "education", label: "Exam Pins" },
  { value: "cashback", label: "Cashback" },
  { value: "referral_bonus", label: "Referral Bonus" },
];

const DATE_FILTERS: { value: DateFilter; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7days", label: "Last 7 Days" },
  { value: "30days", label: "Last 30 Days" },
];

const SERVICE_LABELS: Record<string, string> = {
  data: "Data",
  airtime: "Airtime",
  tv: "Cable TV",
  electricity: "Electricity",
  bet: "Betting",
  education: "Exam Pin",
  cashback: "Cashback",
  referral_bonus: "Referral Bonus",
  signup_bonus: "Signup Bonus",
  refund: "Refund",
  education_pin: "Exam Pin",
  deposit: "Wallet Deposit",
  transfer_sent: "Transfer Sent",
  transfer_received: "Transfer Received",
};

function parseBalanceValue(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}

function getBalanceBefore(tx: Tx): number | null {
  return (
    parseBalanceValue(tx.balance_before) ??
    parseBalanceValue(tx.metadata?.balance_before) ??
    parseBalanceValue(tx.meta?.balance_before)
  );
}

function getBalanceAfter(tx: Tx): number | null {
  return (
    parseBalanceValue(tx.balance_after) ??
    parseBalanceValue(tx.metadata?.balance_after) ??
    parseBalanceValue(tx.meta?.balance_after)
  );
}

function getTxNarration(tx: Tx): string {
  const candidate =
    tx.metadata?.description ??
    tx.meta?.description ??
    tx.metadata?.narration ??
    tx.meta?.narration ??
    "";
  return typeof candidate === "string" ? candidate.trim() : "";
}

function formatPinDisplay(pinEntry: unknown): string {
  if (typeof pinEntry === "string" || typeof pinEntry === "number") {
    return String(pinEntry);
  }
  if (pinEntry && typeof pinEntry === "object") {
    const record = pinEntry as Record<string, unknown>;
    const pinVal = record.pin ?? record.token ?? record.code ?? record.serial;
    if (typeof pinVal === "string" || typeof pinVal === "number") {
      return String(pinVal);
    }
  }
  return "Available in receipt";
}

function TransactionsPage() {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<Tx | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["transactions", user?.id],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, type, amount, created_at, status, reference, recipient, notification_message, balance_before, balance_after, meta, metadata"
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as Tx[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const now = new Date();
    let startDate: Date | null = null;
    if (dateFilter === "today") {
      startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
    } else if (dateFilter === "7days") {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === "30days") {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    return data.filter((t) => {
      const s = (t.status ?? "success").toLowerCase();
      if (filter !== "all" && !s.includes(filter)) return false;
      if (serviceFilter !== "all" && t.type !== serviceFilter) return false;
      if (startDate && new Date(t.created_at) < startDate) return false;
      if (q) {
        const narration = getTxNarration(t);
        const hay = `${t.type} ${t.reference ?? ""} ${t.recipient ?? ""} ${t.notification_message ?? ""} ${narration} ${t.metadata?.provider ?? t.meta?.provider ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [data, filter, serviceFilter, dateFilter, q]);

  const summary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    filtered.forEach((t) => {
      if ((t.status ?? "success").toLowerCase() !== "success") return;
      const amt = Number(t.amount || 0);
      if (amt >= 0) inflow += amt;
      else outflow += Math.abs(amt);
    });
    return { inflow, outflow };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, Tx[]>();
    filtered.forEach((t) => {
      const d = new Date(t.created_at);
      const today = new Date();
      const label = d.toDateString() === today.toDateString()
        ? "Today"
        : d.toLocaleDateString("en-NG", { weekday: "long", month: "short", day: "numeric" });
      const arr = map.get(label) ?? [];
      arr.push(t);
      map.set(label, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  const exportToCSV = () => {
    if (!filtered.length) { toast.error("No transactions to export"); return; }
    const headers = ["Date", "Type", "Reference", "Recipient", "Amount", "Balance Before", "Balance After", "Status", "Narration", "Message"];
    const rows = filtered.map((t) => {
      const isReceivedTransfer =
        t.type === "transfer_received" || String(t.reference || "").endsWith("-received");
      const before = !isReceivedTransfer ? getBalanceBefore(t) : null;
      const after = !isReceivedTransfer ? getBalanceAfter(t) : null;
      return [
        new Date(t.created_at).toLocaleString("en-NG"),
        SERVICE_LABELS[t.type] || t.type,
        t.reference || "",
        t.recipient || t.metadata?.recipient || t.meta?.recipient || "",
        Number(t.amount || 0),
        before !== null ? before : "",
        after !== null ? after : "",
        t.status || "success",
        getTxNarration(t),
        t.notification_message || "",
      ];
    });
    const csv = [
      headers.join(","),
      ...rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vevupay-transactions-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded!");
  };

  const resetFilters = () => {
    setQ("");
    setFilter("all");
    setServiceFilter("all");
    setDateFilter("all");
  };

  const hasActiveFilters = q !== "" || filter !== "all" || serviceFilter !== "all" || dateFilter !== "all";

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="History" title="Transactions" subtitle="Every top-up, purchase, and reward." />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Loading transactions...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="History" title="Transactions" subtitle="Every top-up, purchase, and reward." />
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900/30 p-6 text-center">
          <p className="text-red-600 dark:text-red-400">Failed to load transactions</p>
          <p className="text-sm text-muted-foreground mt-1">Please check your connection and try again.</p>
          <button type="button" onClick={() => void refetch()} className="mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <PageHeader eyebrow="History" title="Transactions" subtitle="Every top-up, purchase, and reward." />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownCircle className="h-3.5 w-3.5 text-green-500" />
            Money In
          </div>
          <p className="mt-1 text-lg font-bold text-green-600 dark:text-green-400">₦{summary.inflow.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpCircle className="h-3.5 w-3.5 text-destructive" />
            Money Out
          </div>
          <p className="mt-1 text-lg font-bold text-destructive">₦{summary.outflow.toLocaleString()}</p>
        </div>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by type, reference, recipient, or narration"
            className="input-field pl-10"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`shrink-0 px-3 rounded-lg border transition flex items-center gap-1.5 text-sm font-medium ${
            showFilters || hasActiveFilters
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-secondary/50 border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5">
              {[serviceFilter !== "all", filter !== "all", dateFilter !== "all"].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="mb-4 rounded-xl border border-border bg-secondary/20 p-3 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Status</label>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "success", "pending", "failed"] as StatusFilter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`chip capitalize transition ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Service</label>
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value as ServiceFilter)} className="input-field text-sm">
              {SERVICE_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">Date Range</label>
            <div className="flex flex-wrap gap-1.5">
              {DATE_FILTERS.map((f) => (
                <button key={f.value} type="button" onClick={() => setDateFilter(f.value)}
                  className={`chip transition ${dateFilter === f.value ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between pt-1 border-t border-border/60">
            <button type="button" onClick={resetFilters} className="text-xs text-muted-foreground hover:text-foreground" disabled={!hasActiveFilters}>Reset all</button>
            <button type="button" onClick={exportToCSV} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Download className="h-3 w-3" /> Export CSV ({filtered.length})
            </button>
          </div>
        </div>
      )}

      {hasActiveFilters && !showFilters && (
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
          <div className="flex gap-3">
            <button type="button" onClick={resetFilters} className="hover:text-foreground">Reset</button>
            <button type="button" onClick={exportToCSV} className="text-primary hover:underline flex items-center gap-1">
              <Download className="h-3 w-3" /> Export
            </button>
          </div>
        </div>
      )}

      {!filtered.length ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gray-100 dark:bg-gray-700">
            <Receipt className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No transactions found</p>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilters ? "Try clearing your filters." : "You haven't made any transactions yet."}
          </p>
          {data?.length === 0 && (
            <Link to="/fund-wallet" className="mt-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition">
              Fund your wallet
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([label, items]) => (
            <section key={label}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</h2>
              <ul className="space-y-2">
                {items.map((tx) => {
                  const numericAmount = Number(tx.amount || 0);
                  const isIncoming = numericAmount >= 0 || tx.type === "cashback" || tx.type === "referral_bonus" || tx.type === "signup_bonus" || tx.type === "deposit" || tx.type === "transfer_received";
                  const status = (tx.status ?? "success").toLowerCase();
                  const badge = status.includes("fail") ? "bg-destructive/15 text-destructive"
                    : status.includes("pend") || status.includes("process") ? "bg-warning/15 text-warning"
                    : "bg-success/15 text-success";
                  const providerName = tx.metadata?.provider || tx.meta?.provider || "";
                  const displayType = SERVICE_LABELS[tx.type] || tx.type.charAt(0).toUpperCase() + tx.type.slice(1);
                  const pinsList = tx.metadata?.pins || tx.meta?.pins || [];
                  const hasPins = tx.type === "education" && Array.isArray(pinsList) && pinsList.length > 0;
                  const pinCount = hasPins ? pinsList.length : 0;
                  const cashbackUsed = Number(tx.metadata?.cashback_used || tx.meta?.cashback_used || 0);
                  const postBalance = !status.includes("fail") ? getBalanceAfter(tx) : null;

                  return (
                    <li key={tx.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 p-4 transition hover:border-primary/40">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${isIncoming ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-destructive/15 text-destructive"}`}>
                          {isIncoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold capitalize">
                            {displayType}{providerName && ` · ${providerName}`}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {new Date(tx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {tx.recipient ? ` · ${tx.recipient}` : ""}
                            {cashbackUsed > 0 ? ` · 🎁 Used ₦${cashbackUsed} Cashback` : ""}
                          </p>
                          {postBalance !== null && (
                            <p className="mt-0.5 text-[11px] font-mono text-muted-foreground/90">
                              Bal: ₦{postBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                            </p>
                          )}
                          {hasPins && (
                            <p className="mt-0.5 text-xs font-mono text-primary">
                              🔑 {pinCount} pin{pinCount > 1 ? 's' : ''} available in receipt
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`text-sm font-bold ${isIncoming ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                            {isIncoming ? "+" : "-"}₦{Math.abs(numericAmount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                          </p>
                          <span className={`chip mt-0.5 capitalize ${badge}`}>{tx.status ?? "success"}</span>
                        </div>
                        <button type="button" onClick={() => setReceipt(tx)} className="btn-ghost !py-1.5 !px-2" aria-label="View receipt">
                          <Receipt className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {receipt && <ReceiptModal tx={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

// ─── Branded & Downloadable Receipt Modal ────────────────────────────
function ReceiptModal({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [downloading, setDownloading] = useState(false);

  const sources = useMemo(() => {
    const list: string[] = [];
    if (logo?.url) list.push(logo.url);
    if (!list.includes("/vevupay-icon.png")) list.push("/vevupay-icon.png");
    return list;
  }, []);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [logoReady, setLogoReady] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setLogoReady(false);
  }, [tx.id, sources]);

  const currentSrc = sources[sourceIndex] ?? null;

  const handleLogoError = () => {
    setLogoReady(false);
    if (sourceIndex + 1 < sources.length) {
      setSourceIndex((prev) => prev + 1);
    }
  };

  const numericAmount = Number(tx.amount || 0);
  const isIncoming =
    numericAmount >= 0 ||
    tx.type === "cashback" ||
    tx.type === "referral_bonus" ||
    tx.type === "signup_bonus" ||
    tx.type === "deposit" ||
    tx.type === "transfer_received";
  const status = (tx.status ?? "success").toLowerCase();

  const statusConfig = {
    success: {
      label: "Successful",
      color: "text-emerald-400",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/30",
      icon: CheckCircle2,
    },
    failed: {
      label: "Failed",
      color: "text-rose-400",
      bg: "bg-rose-500/15",
      border: "border-rose-500/30",
      icon: XCircle,
    },
    processing: {
      label: "Processing",
      color: "text-amber-400",
      bg: "bg-amber-500/15",
      border: "border-amber-500/30",
      icon: Clock,
    },
    pending: {
      label: "Pending",
      color: "text-amber-400",
      bg: "bg-amber-500/15",
      border: "border-amber-500/30",
      icon: Clock,
    },
  }[status] || {
    label: tx.status || "Unknown",
    color: "text-slate-300",
    bg: "bg-slate-800",
    border: "border-slate-700",
    icon: Info,
  };

  const StatusIcon = statusConfig.icon;

  const isReceivedTransfer =
    tx.type === "transfer_received" ||
    String(tx.reference || "").endsWith("-received");

  const rawBefore = !isReceivedTransfer ? getBalanceBefore(tx) : null;
  const rawAfter = !isReceivedTransfer ? getBalanceAfter(tx) : null;

  const providerName = tx.metadata?.provider || tx.meta?.provider || "";
  const customerName = tx.metadata?.customer_name || tx.meta?.customer_name || "";
  const narration = getTxNarration(tx);
  const counterpartyLabel =
    tx.type === "transfer_received"
      ? "Sender"
      : tx.type === "transfer_sent"
        ? "Recipient"
        : "Recipient / Target";
  const counterpartyValue =
    tx.type === "transfer_received"
      ? tx.metadata?.sender_name || tx.metadata?.counterparty_name || tx.meta?.sender_name || tx.meta?.counterparty_name || tx.recipient
      : tx.type === "transfer_sent"
        ? tx.metadata?.recipient_name || tx.metadata?.counterparty_name || tx.meta?.recipient_name || tx.meta?.counterparty_name || tx.recipient
        : tx.recipient || tx.metadata?.recipient_name || tx.metadata?.counterparty_name || tx.meta?.recipient_name || tx.meta?.counterparty_name;
  const cashbackUsed = Number(tx.metadata?.cashback_used || tx.meta?.cashback_used || 0);
  const totalBillAmount = Math.abs(numericAmount) + cashbackUsed;
  const cashbackPercentage = totalBillAmount > 0 ? Math.round((cashbackUsed / totalBillAmount) * 100) : 0;

  const pins = tx.metadata?.pins || tx.meta?.pins || [];
  const isEducation = tx.type === "education";

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const formattedDate = new Date(tx.created_at).toLocaleString("en-NG", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const handleDownloadImage = async () => {
    if (!receiptRef.current) return;

    const logoEl = logoRef.current;
    if (!logoReady || !logoEl || !logoEl.complete || logoEl.naturalWidth === 0) {
      toast.error("Unable to download receipt logo");
      return;
    }

    setDownloading(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 30));

      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        backgroundColor: "#0b1120",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `VevuPay-Receipt-${tx.reference || tx.id.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Receipt downloaded as image!");
    } catch {
      toast.error("Failed to generate receipt image");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transaction E-Receipt"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative w-full max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl bg-[#0b1120] text-slate-100 shadow-2xl sm:rounded-3xl flex flex-col border border-slate-800" onClick={(e) => e.stopPropagation()}>

        {/* Header Controls */}
        <div className="sticky top-0 z-20 flex items-center justify-between bg-[#0b1120]/95 backdrop-blur px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-100">E-Receipt</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownloadImage()}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 text-slate-950 text-xs font-bold shadow hover:bg-teal-400 transition disabled:opacity-50"
            >
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Save Image
            </button>
            <button type="button" onClick={onClose} aria-label="Close receipt" className="p-1.5 rounded-full hover:bg-slate-800 transition">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Printable / Downloadable Receipt Canvas Container */}
        <div className="p-6 space-y-5 bg-[#0b1120] text-slate-100" ref={receiptRef}>

          {/* Brand Logo & Header Center */}
          <div className="text-center space-y-1.5 border-b border-slate-800 pb-5">
            <div className="relative mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-700/80 bg-teal-500 text-xl font-black text-slate-950 shadow-md">
              <span aria-hidden={logoReady} className="select-none">
                V
              </span>

              {currentSrc && (
                <img
                  ref={logoRef}
                  key={currentSrc}
                  src={currentSrc}
                  alt="VevuPay Logo"
                  onLoad={(e) => {
                    if (e.currentTarget.naturalWidth > 0) {
                      setLogoReady(true);
                    }
                  }}
                  onError={handleLogoError}
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
                    logoReady ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
                />
              )}
            </div>
            <h2 className="text-lg font-black tracking-tight text-white">VevuPay</h2>
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">Secure Payment Hub</p>
          </div>

          {/* Status Badge & Amount */}
          <div className={`flex flex-col items-center justify-center p-5 rounded-2xl border ${statusConfig.bg} ${statusConfig.border}`}>
            <StatusIcon className={`h-8 w-8 mb-1.5 ${statusConfig.color}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${statusConfig.color}`}>{statusConfig.label}</span>
            <p className={`text-3xl font-black mt-1 ${isIncoming ? "text-emerald-400" : "text-rose-400"}`}>
              {isIncoming ? "+" : "-"}₦{Math.abs(numericAmount).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{formattedDate}</p>
          </div>

          {/* Transaction Metadata Details */}
          <div className="space-y-3 rounded-2xl bg-slate-900/90 p-4 text-sm border border-slate-800">
            <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
              <span className="text-slate-400 text-xs">Transaction Type</span>
              <span className="font-bold text-slate-100 text-right">{SERVICE_LABELS[tx.type] || tx.type}</span>
            </div>

            {providerName && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Provider / Network</span>
                <span className="font-semibold text-slate-100 uppercase text-right">{providerName}</span>
              </div>
            )}

            {customerName && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Customer Name</span>
                <span className="font-semibold text-slate-100 text-right">{customerName}</span>
              </div>
            )}

            {counterpartyValue && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">{counterpartyLabel}</span>
                <span className="font-mono text-xs font-bold text-slate-100 text-right break-all">{counterpartyValue}</span>
              </div>
            )}

            {narration && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Narration</span>
                <span className="font-medium text-slate-100 text-right break-words max-w-[65%]">{narration}</span>
              </div>
            )}

            {rawBefore !== null && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Balance Before</span>
                <span className="font-mono text-xs font-semibold text-slate-300 text-right">
                  ₦{rawBefore.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {rawAfter !== null && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Balance After</span>
                <span className="font-mono text-xs font-bold text-slate-100 text-right">
                  ₦{rawAfter.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {cashbackUsed > 0 && (
              <div className="py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                  <span className="flex items-center gap-1"><Gift className="h-3.5 w-3.5" /> Cashback Applied</span>
                  <span>-₦{cashbackUsed.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {cashbackPercentage}% of this {SERVICE_LABELS[tx.type] || tx.type} purchase was paid using your accumulated cashback rewards balance.
                </p>
              </div>
            )}

            {tx.reference && (
              <div className="flex justify-between gap-4 py-1 border-b border-slate-800">
                <span className="text-slate-400 text-xs">Reference ID</span>
                <span className="font-mono text-[11px] font-medium text-slate-300 text-right break-all">{tx.reference}</span>
              </div>
            )}

            <div className="flex justify-between gap-4 py-1">
              <span className="text-slate-400 text-xs">Payment Status</span>
              <span className={`font-bold capitalize ${statusConfig.color}`}>{statusConfig.label}</span>
            </div>
          </div>

          {isEducation && Array.isArray(pins) && pins.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-teal-300">Exam PINs Generated ({pins.length})</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {pins.map((p: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800 text-xs font-mono text-slate-100">
                    <span>Pin: <strong>{formatPinDisplay(p)}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 text-center border-t border-slate-800">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5 text-teal-400" />
              <span>Verified & Secured by VevuPay Engine</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
