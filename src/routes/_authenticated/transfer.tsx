// src/routes/_authenticated/transfer.tsx

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

import {
  Send,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  UserCheck,
  Lock,
  Check,
  TrendingUp,
  KeyRound,
  UserPlus,
  Users,
  Search,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/transfer")({
  head: () => ({
    meta: [{ title: "Transfer Funds — VevuPay" }],
  }),
  component: TransferPage,
});

type Step = "input" | "pin" | "success";

interface VerifiedRecipient {
  id: string;
  full_name: string;
  vevu_id: string;
}

interface SavedTransferRecipient {
  id: string;
  beneficiary_name: string;
  recipient: string;
  customer_name: string | null;
  transferCount?: number;
}

interface RecipientLookupResult {
  id: string;
  full_name: string | null;
  vevu_id: string;
}

interface TransferAllowance {
  tier: number;
  tier_name: string;
  single_limit: number;
  daily_limit: number;
  transferred_24h: number;
  remaining_24h: number;
  max_allowed_now: number;
  is_frozen: boolean;
  next_tier: number | null;
  next_tier_name: string | null;
  tx_needed_for_next: number;
  days_needed_for_next: number;
  age_days_needed_for_next: number;
}

interface InitiateTransferResponse {
  success?: boolean;
  message?: string;
  error?: string;
  transferId?: string;
  transfer_id?: string;
  recipientName?: string;
  recipientVevuId?: string;
  amount?: number;
  reference?: string;
  completed?: boolean;
}

interface TransferResponse {
  success?: boolean;
  message?: string;
  error?: string;
  reference?: string;
  amount?: number;
  transferId?: string;
}

const MIN_TRANSFER_AMOUNT = 100;

const DEFAULT_ALLOWANCE: TransferAllowance = {
  tier: 1,
  tier_name: "Starter",
  single_limit: 10000,
  daily_limit: 25000,
  transferred_24h: 0,
  remaining_24h: 25000,
  max_allowed_now: 10000,
  is_frozen: false,
  next_tier: 2,
  next_tier_name: "Regular",
  tx_needed_for_next: 5,
  days_needed_for_next: 3,
  age_days_needed_for_next: 7,
};

const VEVU_ID_REGEX = /^VP\d+$/i;

function hasAtMostTwoDecimals(rawOrNum: string | number): boolean {
  const str = typeof rawOrNum === "number" ? String(rawOrNum) : rawOrNum.trim();
  if (!str || !/^\d+(\.\d+)?$/.test(str)) return false;
  const parts = str.split(".");
  return !parts[1] || parts[1].length <= 2;
}

function formatNaira(value: number): string {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    maximumFractionDigits: 2,
  })}`;
}

function TransferPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("input");
  const [loading, setLoading] = useState(false);

  const verifyRequestSeqRef = useRef(0);
  const newRecipientRequestSeqRef = useRef(0);

  // PIN status & allowance state
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [checkingPinStatus, setCheckingPinStatus] = useState(false);
  const [pinSetupPromptOpen, setPinSetupPromptOpen] = useState(false);

  const [allowance, setAllowance] = useState<TransferAllowance>(DEFAULT_ALLOWANCE);
  const [loadingAllowance, setLoadingAllowance] = useState(true);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  // Form inputs
  const [identifier, setIdentifier] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");

  // Recipient verification & saved recipients
  const [verifiedRecipient, setVerifiedRecipient] =
    useState<VerifiedRecipient | null>(null);
  const [confirmedSuccessRecipient, setConfirmedSuccessRecipient] =
    useState<VerifiedRecipient | null>(null);
  const [confirmedSuccessAmount, setConfirmedSuccessAmount] = useState<number>(0);
  const [verifying, setVerifying] = useState(false);

  const [savedRecipients, setSavedRecipients] = useState<SavedTransferRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  // View All modal, live search, manual add modal & remove confirmation modal
  const [viewAllRecipientsOpen, setViewAllRecipientsOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");

  const [addRecipientModalOpen, setAddRecipientModalOpen] = useState(false);
  const [newRecipientVevuId, setNewRecipientVevuId] = useState("");
  const [newRecipientName, setNewRecipientName] = useState("");
  const [newRecipientVerified, setNewRecipientVerified] =
    useState<VerifiedRecipient | null>(null);
  const [verifyingNewRecipient, setVerifyingNewRecipient] = useState(false);
  const [addingManualRecipient, setAddingManualRecipient] = useState(false);

  const [saveRecipientModalOpen, setSaveRecipientModalOpen] = useState(false);
  const [recipientAlias, setRecipientAlias] = useState("");
  const [savingRecipient, setSavingRecipient] = useState(false);

  const [pendingRemoveRecipient, setPendingRemoveRecipient] =
    useState<SavedTransferRecipient | null>(null);
  const [removingRecipient, setRemovingRecipient] = useState(false);

  // Transfer authorization
  const [transferId, setTransferId] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);

  // Successful transfer reference
  const [transferReference, setTransferReference] =
    useState<string | null>(null);

  const maxAllowedByTier = useMemo(() => {
    if (allowance.is_frozen) return 0;
    return Math.max(
      0,
      Math.min(
        Number(allowance.single_limit ?? 10000),
        Number(allowance.remaining_24h ?? 25000)
      )
    );
  }, [allowance]);

  const effectiveInputCap = useMemo(() => {
    if (allowance.is_frozen) return 0;
    if (walletBalance === null) return maxAllowedByTier;
    return Math.max(0, Math.min(maxAllowedByTier, walletBalance));
  }, [allowance.is_frozen, maxAllowedByTier, walletBalance]);

  const topRecipients = useMemo(() => {
    return savedRecipients.slice(0, 2);
  }, [savedRecipients]);

  const filteredRecipients = useMemo(() => {
    const rawQuery = recipientSearch.trim();
    if (!rawQuery) return savedRecipients;

    const upperQuery = rawQuery.toUpperCase();
    const lowerQuery = rawQuery.toLowerCase();

    return savedRecipients.filter((item) => {
      const vevuId = item.recipient.trim().toUpperCase();
      const alias = item.beneficiary_name.trim().toLowerCase();
      const fullName = (item.customer_name || "").trim().toLowerCase();

      const matchesIdPrefix = vevuId.startsWith(upperQuery);
      const matchesName =
        alias.includes(lowerQuery) || fullName.includes(lowerQuery);

      return matchesIdPrefix || matchesName;
    });
  }, [savedRecipients, recipientSearch]);

  const loadSavedRecipients = async (userId?: string): Promise<SavedTransferRecipient[]> => {
    setLoadingRecipients(true);
    try {
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: userData } = await supabase.auth.getUser();
        resolvedUserId = userData?.user?.id;
      }
      if (!resolvedUserId) return [];

      const { data, error } = await supabase
        .from("beneficiaries")
        .select("id, beneficiary_name, recipient, customer_name")
        .eq("user_id", resolvedUserId)
        .eq("service_type", "transfer")
        .order("updated_at", { ascending: false });

      if (error || !data) return [];

      const frequencyMap = new Map<string, number>();
      try {
        const { data: txRows } = await supabase
          .from("transactions")
          .select("type, status, recipient, notification_message, metadata")
          .eq("user_id", resolvedUserId)
          .eq("type", "transfer_sent");

        if (Array.isArray(txRows)) {
          for (const row of txRows as Array<Record<string, any>>) {
            const status = String(row?.status ?? "success").toLowerCase();
            if (status.includes("fail")) continue;

            const candidate =
              typeof row?.metadata?.recipient_vevu_id === "string"
                ? row.metadata.recipient_vevu_id
                : typeof row?.metadata?.vevu_id === "string"
                ? row.metadata.vevu_id
                : typeof row?.recipient === "string"
                ? row.recipient
                : typeof row?.notification_message === "string"
                ? row.notification_message.match(/\bVP\d+\b/i)?.[0] || ""
                : "";

            const normalizedId = candidate.trim().toUpperCase();
            if (VEVU_ID_REGEX.test(normalizedId)) {
              frequencyMap.set(
                normalizedId,
                (frequencyMap.get(normalizedId) || 0) + 1
              );
            }
          }
        }
      } catch {
        // Fallback gracefully to updated_at order if transaction history isn't accessible
      }

      const rankedList = (data as SavedTransferRecipient[])
        .map((item) => ({
          ...item,
          transferCount: frequencyMap.get(item.recipient.trim().toUpperCase()) || 0,
        }))
        .sort((a, b) => (b.transferCount || 0) - (a.transferCount || 0));

      setSavedRecipients(rankedList);
      return rankedList;
    } catch {
      return [];
    } finally {
      setLoadingRecipients(false);
    }
  };

  const checkUserHasPin = async (): Promise<boolean | null> => {
    setCheckingPinStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-transaction-pin-status",
        { body: {} }
      );
      if (!error && typeof data?.hasPin === "boolean") {
        setHasPin(data.hasPin);
        return data.hasPin;
      }
      return hasPin;
    } catch {
      return hasPin;
    } finally {
      setCheckingPinStatus(false);
    }
  };

  const loadAllowanceAndBalance = async () => {
    setLoadingAllowance(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      const [{ data: walletRow }, { data: fnData, error: fnError }] =
        await Promise.all([
          supabase
            .from("wallets")
            .select("balance")
            .eq("profile_id", userId)
            .maybeSingle(),
          supabase.functions.invoke("send-transfer", {
            body: {
              action: "allowance",
              user_id: userId,
            },
          }),
        ]);

      if (walletRow && typeof walletRow.balance !== "undefined") {
        setWalletBalance(Number(walletRow.balance ?? 0));
      }

      if (!fnError && fnData?.success && fnData?.allowance) {
        const raw = fnData.allowance;
        setAllowance({
          tier: Number(raw.tier ?? 1),
          tier_name: raw.tier_name ?? "Starter",
          single_limit: Number(raw.single_limit ?? 10000),
          daily_limit: Number(raw.daily_limit ?? 25000),
          transferred_24h: Number(raw.transferred_24h ?? 0),
          remaining_24h: Number(raw.remaining_24h ?? 25000),
          max_allowed_now: Number(raw.max_allowed_now ?? 10000),
          is_frozen: Boolean(raw.is_frozen),
          next_tier: raw.next_tier === null ? null : Number(raw.next_tier),
          next_tier_name: raw.next_tier_name ?? null,
          tx_needed_for_next: Number(raw.tx_needed_for_next ?? 0),
          days_needed_for_next: Number(raw.days_needed_for_next ?? 0),
          age_days_needed_for_next: Number(raw.age_days_needed_for_next ?? 0),
        });
      }
    } catch {
      // Fall back to default allowance display if lookup is transiently unavailable
    } finally {
      setLoadingAllowance(false);
    }
  };

  useEffect(() => {
    void loadAllowanceAndBalance();
    void loadSavedRecipients();
    void checkUserHasPin();
  }, []);

  const handleTransferSucceeded = async (
    reference: string | null,
    confirmedRecipient: VerifiedRecipient,
    confirmedAmount: number
  ) => {
    setTransferReference(reference);
    setConfirmedSuccessRecipient(confirmedRecipient);
    setConfirmedSuccessAmount(confirmedAmount);
    setStep("success");

    setPin("");
    setTransferId(null);
    setRequestKey(null);

    await loadAllowanceAndBalance();
    const latestSaved = await loadSavedRecipients();

    const normalizedTarget = confirmedRecipient.vevu_id.trim().toUpperCase();
    const alreadySaved = latestSaved.some(
      (item) => item.recipient.trim().toUpperCase() === normalizedTarget
    );

    if (!alreadySaved) {
      setRecipientAlias(confirmedRecipient.full_name.slice(0, 60));
      setSaveRecipientModalOpen(true);
    }

    toast.success("Transfer successful!");
  };

  const insertBeneficiaryRecord = async (
    targetRecipient: VerifiedRecipient,
    customAlias?: string
  ): Promise<boolean> => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      toast.error("Session expired. Please sign in again.");
      return false;
    }

    const normalizedVevuId = targetRecipient.vevu_id.trim().toUpperCase();
    const fallbackName = (targetRecipient.full_name || normalizedVevuId).trim();
    const rawName = (customAlias || fallbackName).trim() || fallbackName;
    const cleanName = rawName.slice(0, 60);
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("beneficiaries")
      .select("id")
      .eq("user_id", userId)
      .eq("service_type", "transfer")
      .ilike("recipient", normalizedVevuId)
      .maybeSingle();

    if (existing) {
      await loadSavedRecipients(userId);
      toast.info("This user is already in your recipients.");
      return true;
    }

    const { error } = await supabase.from("beneficiaries").insert({
      user_id: userId,
      service_type: "transfer",
      beneficiary_name: cleanName,
      provider_slug: "vevupay",
      provider_name: "VevuPay",
      recipient: normalizedVevuId,
      customer_name: fallbackName.slice(0, 60),
      created_at: now,
      updated_at: now,
    });

    if (error) {
      if (error.code === "23505") {
        await loadSavedRecipients(userId);
        toast.info("This user is already in your recipients.");
        return true;
      }
      console.error("Save recipient failed:", error.message || "Insert error");
      toast.error("Could not save recipient. Please try again.");
      return false;
    }

    await loadSavedRecipients(userId);
    toast.success(`${cleanName} added to your recipients!`);
    return true;
  };

  const handleSaveRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = confirmedSuccessRecipient || verifiedRecipient;
    if (!target || savingRecipient) return;

    setSavingRecipient(true);
    try {
      const ok = await insertBeneficiaryRecord(target, recipientAlias);
      if (ok) {
        setSaveRecipientModalOpen(false);
      }
    } catch {
      toast.error("Failed to save recipient.");
    } finally {
      setSavingRecipient(false);
    }
  };

  const handleVerifyNewRecipient = async () => {
    const query = newRecipientVevuId.trim().toUpperCase();
    if (!query) {
      toast.error("Please enter a Vevu ID.");
      return;
    }
    if (!VEVU_ID_REGEX.test(query)) {
      toast.error("Please enter a valid Vevu ID (e.g. VP47565202).");
      return;
    }

    const seq = ++newRecipientRequestSeqRef.current;
    setVerifyingNewRecipient(true);
    setNewRecipientVerified(null);
    try {
      const { data, error } = await supabase.rpc("lookup_recipient", {
        search_query: query,
      });

      if (seq !== newRecipientRequestSeqRef.current) return;

      if (error) {
        toast.error("Unable to verify Vevu ID. Please try again.");
        return;
      }

      const recipients = (data || []) as RecipientLookupResult[];
      if (recipients.length === 0) {
        toast.error("Recipient not found. Check the Vevu ID.");
        return;
      }
      if (recipients.length > 1) {
        toast.error("Multiple recipients found. Please check the exact Vevu ID.");
        return;
      }

      const found = recipients[0];
      if (!found.id || !found.vevu_id) {
        toast.error("Invalid recipient information.");
        return;
      }

      const verified: VerifiedRecipient = {
        id: found.id,
        full_name: found.full_name || "Vevu User",
        vevu_id: found.vevu_id.toUpperCase(),
      };
      setNewRecipientVevuId(verified.vevu_id);
      setNewRecipientVerified(verified);
      if (!newRecipientName.trim()) {
        setNewRecipientName(verified.full_name.slice(0, 60));
      }
      toast.success(`Found ${verified.full_name}`);
    } catch {
      if (seq === newRecipientRequestSeqRef.current) {
        toast.error("Failed to verify Vevu ID.");
      }
    } finally {
      if (seq === newRecipientRequestSeqRef.current) {
        setVerifyingNewRecipient(false);
      }
    }
  };

  const handleAddManualRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addingManualRecipient) return;

    let target = newRecipientVerified;
    if (!target) {
      const query = newRecipientVevuId.trim().toUpperCase();
      if (!VEVU_ID_REGEX.test(query)) {
        toast.error("Please enter and verify a valid Vevu ID (e.g. VP47565202).");
        return;
      }

      const seq = ++newRecipientRequestSeqRef.current;
      setVerifyingNewRecipient(true);
      try {
        const { data, error } = await supabase.rpc("lookup_recipient", {
          search_query: query,
        });
        if (seq !== newRecipientRequestSeqRef.current) return;
        const recipients = (data || []) as RecipientLookupResult[];
        if (error || recipients.length !== 1 || !recipients[0]?.id || !recipients[0]?.vevu_id) {
          toast.error("Please verify the Vevu ID first.");
          return;
        }
        target = {
          id: recipients[0].id,
          full_name: recipients[0].full_name || "Vevu User",
          vevu_id: recipients[0].vevu_id.toUpperCase(),
        };
        setNewRecipientVerified(target);
      } finally {
        if (seq === newRecipientRequestSeqRef.current) {
          setVerifyingNewRecipient(false);
        }
      }
    }

    setAddingManualRecipient(true);
    try {
      const ok = await insertBeneficiaryRecord(target, newRecipientName);
      if (ok) {
        setAddRecipientModalOpen(false);
        setNewRecipientVevuId("");
        setNewRecipientName("");
        setNewRecipientVerified(null);
      }
    } catch {
      toast.error("Failed to add recipient.");
    } finally {
      setAddingManualRecipient(false);
    }
  };

  const handleRequestRemoveRecipient = (
    e: React.MouseEvent,
    recipientRow: SavedTransferRecipient
  ) => {
    e.stopPropagation();
    setPendingRemoveRecipient(recipientRow);
  };

  const handleConfirmRemoveRecipient = async () => {
    if (!pendingRemoveRecipient || removingRecipient) return;

    const target = pendingRemoveRecipient;
    setRemovingRecipient(true);
    try {
      const { error } = await supabase
        .from("beneficiaries")
        .delete()
        .eq("id", target.id);

      if (error) {
        toast.error("Failed to remove recipient.");
        return;
      }

      setSavedRecipients((prev) =>
        prev.filter((item) => item.id !== target.id)
      );

      if (
        verifiedRecipient?.vevu_id.trim().toUpperCase() ===
        target.recipient.trim().toUpperCase()
      ) {
        setVerifiedRecipient(null);
        setIdentifier("");
      }

      setPendingRemoveRecipient(null);
      toast.success(`Removed ${target.beneficiary_name}`);
    } catch {
      toast.error("Failed to remove recipient.");
    } finally {
      setRemovingRecipient(false);
    }
  };

  const handleAmountChange = (rawValue: string) => {
    setLimitNotice(null);

    if (rawValue === "") {
      setAmount("");
      return;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      return;
    }

    if (allowance.is_frozen) {
      setAmount("0");
      setLimitNotice("Your account is currently restricted from sending transfers.");
      return;
    }

    if (parsed > maxAllowedByTier) {
      const clamped = Number(maxAllowedByTier.toFixed(2));
      setAmount(String(clamped));
      if (allowance.remaining_24h < allowance.single_limit) {
        setLimitNotice(
          `Capped at ${formatNaira(clamped)} — your remaining 24-hour Tier ${allowance.tier} limit.`
        );
      } else {
        setLimitNotice(
          `Capped at ${formatNaira(clamped)} — your Tier ${allowance.tier} (${allowance.tier_name}) one-time limit.`
        );
      }
      return;
    }

    setAmount(rawValue);
  };

  const getFunctionError = async (
    error: any,
    fallback: string
  ): Promise<string> => {
    try {
      const response = error?.context;

      if (response && typeof response.json === "function") {
        const body = await response.json();

        if (typeof body?.message === "string" && body.message.trim()) {
          return body.message;
        }

        if (typeof body?.error === "string" && body.error.trim()) {
          return body.error;
        }
      }
    } catch {
      // Ignore unreadable error responses.
    }

    return fallback;
  };

  const completeTransfer = async (
    authorizationId: string,
    confirmedRecipient: VerifiedRecipient,
    confirmedAmount: number
  ): Promise<boolean> => {
    const { data, error } = await supabase.functions.invoke(
      "complete-transfer",
      {
        body: {
          transferId: authorizationId,
        },
      }
    );

    if (error) {
      const message = await getFunctionError(
        error,
        "We could not complete your transfer. Check your transaction history before trying again."
      );

      toast.error(message);
      return false;
    }

    const result = data as TransferResponse | null;

    if (!result?.success) {
      toast.error(
        result?.message || result?.error || "Transfer could not be completed."
      );

      return false;
    }

    await handleTransferSucceeded(
      result.reference || null,
      confirmedRecipient,
      confirmedAmount
    );
    return true;
  };

  const verifyRecipientByQuery = async (rawQuery: string, silentSuccess = false) => {
    const query = rawQuery.trim().toUpperCase();

    if (!query) {
      toast.error("Please enter a Vevu ID.");
      return;
    }

    if (!VEVU_ID_REGEX.test(query)) {
      toast.error("Please enter a valid Vevu ID (e.g. VP47565202).");
      return;
    }

    const seq = ++verifyRequestSeqRef.current;
    setVerifying(true);
    setVerifiedRecipient(null);

    try {
      const { data, error } = await supabase.rpc(
        "lookup_recipient",
        {
          search_query: query,
        }
      );

      if (seq !== verifyRequestSeqRef.current) return;

      if (error) {
        toast.error(
          "Unable to verify Vevu ID. Please try again."
        );
        return;
      }

      const recipients =
        (data || []) as RecipientLookupResult[];

      if (recipients.length === 0) {
        toast.error(
          "Recipient not found. Check the Vevu ID."
        );
        return;
      }

      if (recipients.length > 1) {
        toast.error(
          "Multiple recipients found. Please check the exact Vevu ID."
        );
        return;
      }

      const recipient = recipients[0];

      if (!recipient.id || !recipient.vevu_id) {
        toast.error(
          "Invalid recipient information. Please try again."
        );
        return;
      }

      setIdentifier(query);
      setVerifiedRecipient({
        id: recipient.id,
        full_name: recipient.full_name || "Vevu User",
        vevu_id: recipient.vevu_id.toUpperCase(),
      });

      setTransferId(null);
      setRequestKey(null);
      setTransferReference(null);

      if (!silentSuccess) {
        toast.success("Recipient verified successfully!");
      }
    } catch {
      if (seq === verifyRequestSeqRef.current) {
        toast.error("Failed to verify Vevu ID.");
      }
    } finally {
      if (seq === verifyRequestSeqRef.current) {
        setVerifying(false);
      }
    }
  };

  const handleVerifyRecipient = async () => {
    await verifyRecipientByQuery(identifier);
  };

  const handleSelectSavedRecipient = async (saved: SavedTransferRecipient) => {
    const vevuId = saved.recipient.trim().toUpperCase();
    setIdentifier(vevuId);
    setViewAllRecipientsOpen(false);
    setRecipientSearch("");
    await verifyRecipientByQuery(vevuId, true);
  };

  const handleProceedToAuth = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    const numAmount = Number(amount);

    if (allowance.is_frozen) {
      toast.error("Your account is currently restricted from sending transfers.");
      return;
    }

    if (!verifiedRecipient) {
      toast.error("Please verify a recipient Vevu ID first.");
      return;
    }

    if (!Number.isFinite(numAmount) || numAmount <= 0 || !hasAtMostTwoDecimals(amount)) {
      toast.error("Please enter a valid transfer amount.");
      return;
    }

    if (numAmount < MIN_TRANSFER_AMOUNT) {
      toast.error(`Minimum transfer amount is ${formatNaira(MIN_TRANSFER_AMOUNT)}.`);
      return;
    }

    if (numAmount > allowance.single_limit) {
      toast.error(
        `Amount exceeds your Tier ${allowance.tier} one-time limit of ${formatNaira(allowance.single_limit)}.`
      );
      return;
    }

    if (numAmount > allowance.remaining_24h) {
      toast.error(
        `Amount exceeds your remaining 24-hour transfer limit of ${formatNaira(allowance.remaining_24h)}.`
      );
      return;
    }

    if (walletBalance !== null && numAmount > walletBalance) {
      toast.error("Amount exceeds your available wallet balance.");
      return;
    }

    const pinExists = await checkUserHasPin();
    if (pinExists === false) {
      setPinSetupPromptOpen(true);
      return;
    }

    setPin("");
    setTransferId(null);
    setRequestKey(null);

    setStep("pin");
  };

  const handleInitiateTransfer = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!verifiedRecipient) {
      toast.error("Please verify the recipient Vevu ID again.");
      setStep("input");
      return;
    }

    const numAmount = Number(amount);

    if (
      !Number.isFinite(numAmount) ||
      numAmount <= 0 ||
      !hasAtMostTwoDecimals(amount)
    ) {
      toast.error("Please enter a valid transfer amount.");
      return;
    }

    if (numAmount < MIN_TRANSFER_AMOUNT) {
      toast.error(`Minimum transfer amount is ${formatNaira(MIN_TRANSFER_AMOUNT)}.`);
      setStep("input");
      return;
    }

    if (numAmount > maxAllowedByTier) {
      toast.error(
        `Amount cannot exceed ${formatNaira(maxAllowedByTier)} based on your Tier ${allowance.tier} limits.`
      );
      setStep("input");
      return;
    }

    if (!/^\d{6}$/.test(pin)) {
      toast.error(
        "Please enter your 6-digit transaction PIN."
      );
      return;
    }

    setLoading(true);

    try {
      const currentRequestKey =
        requestKey || crypto.randomUUID();

      if (!requestKey) {
        setRequestKey(currentRequestKey);
      }

      const activeRecipient = verifiedRecipient;

      const { data, error } = await supabase.functions.invoke(
        "initiate-transfer",
        {
          body: {
            recipientIdentifier: activeRecipient.vevu_id,
            amount: numAmount,
            narration:
              note.trim() ||
              "Peer-to-peer wallet transfer",
            transactionPin: pin,
            requestKey: currentRequestKey,
          },
        }
      );

      if (error) {
        const message = await getFunctionError(
          error,
          "Unable to authorize this transfer. Please try again."
        );

        if (message.toLowerCase().includes("set up your pin") || message.toLowerCase().includes("no pin")) {
          setHasPin(false);
          setStep("input");
          setPinSetupPromptOpen(true);
          return;
        }

        toast.error(message);
        return;
      }

      const result =
        data as InitiateTransferResponse | null;

      if (!result?.success) {
        const errMsg =
          result?.message || result?.error || "Transfer authorization failed.";
        if (errMsg.toLowerCase().includes("set up your pin") || errMsg.toLowerCase().includes("no pin")) {
          setHasPin(false);
          setStep("input");
          setPinSetupPromptOpen(true);
          return;
        }
        toast.error(errMsg);
        return;
      }

      const authorizationId =
        result.transferId || result.transfer_id;

      if (!authorizationId) {
        toast.error(
          "Transfer authorization was not returned. Please contact support before retrying."
        );
        return;
      }

      setTransferId(authorizationId);
      setPin("");

      await completeTransfer(authorizationId, activeRecipient, numAmount);
    } catch {
      toast.error(
        "An unexpected error occurred while authorizing the transfer."
      );
    } finally {
      setPin("");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto pb-12">

      {/* TOP HEADER */}

      <div className="flex items-center gap-3">

        <Link
          to="/dashboard"
          className="rounded-2xl bg-slate-900 border border-slate-800 p-2.5 text-slate-300 hover:text-white transition shadow-inner"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div>
          <h1 className="text-xl font-extrabold text-white tracking-tight">
            Wallet Transfer
          </h1>

          <p className="text-xs text-slate-400">
            Instant peer-to-peer fund transfer by Vevu ID
          </p>
        </div>

      </div>

      {/* TIER & 24-HOUR ALLOWANCE CARD */}

      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-extrabold">
              Tier {allowance.tier} · {allowance.tier_name}
            </span>
            {loadingAllowance && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
            )}
          </div>

          <div className="text-right">
            <p className="text-[11px] text-slate-400">24h Remaining</p>
            <p className="text-xs font-extrabold text-white">
              {formatNaira(allowance.remaining_24h)}{" "}
              <span className="text-slate-500 font-normal">
                / {formatNaira(allowance.daily_limit)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
          <span>
            Min {formatNaira(MIN_TRANSFER_AMOUNT)} · Max per transfer:{" "}
            <strong className="text-slate-200">
              {formatNaira(allowance.single_limit)}
            </strong>
          </span>
          {walletBalance !== null && (
            <span>
              Wallet:{" "}
              <strong className="text-slate-200">
                {formatNaira(walletBalance)}
              </strong>
            </span>
          )}
        </div>

        {allowance.next_tier && allowance.next_tier_name && (
          <div className="flex items-start gap-2 rounded-xl bg-slate-950/70 border border-slate-800/80 px-3 py-2 text-[11px] text-slate-400">
            <TrendingUp className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              To unlock{" "}
              <strong className="text-cyan-300">
                Tier {allowance.next_tier} ({allowance.next_tier_name})
              </strong>
              : {allowance.tx_needed_for_next} more qualifying tx,{" "}
              {allowance.days_needed_for_next} active day(s), and{" "}
              {allowance.age_days_needed_for_next} account age day(s).
            </span>
          </div>
        )}
      </div>

      {/* SECURITY BANNER */}

      <div className="rounded-2xl bg-slate-900/60 border border-cyan-500/20 p-4 flex items-start gap-3 backdrop-blur shadow-inner">

        <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0 mt-0.5">
          <ShieldCheck className="h-5 w-5" />
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          Transfers are protected by your 6-digit transaction PIN
          with idempotent processing and instant wallet settlement.
        </p>

      </div>

      {/* STEP 1: RECIPIENT AND AMOUNT */}

      {step === "input" && (

        <form
          onSubmit={handleProceedToAuth}
          className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-5 shadow-[0_0_40px_rgba(25,197,194,0.08)] backdrop-blur"
        >

          {/* TOP 2 MOST-TRANSFERRED RECIPIENTS + VIEW ALL */}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <Users className="h-3.5 w-3.5 text-cyan-400" />
                Top Recipients
                {loadingRecipients && (
                  <Loader2 className="h-3 w-3 animate-spin text-slate-400 ml-1" />
                )}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewRecipientVevuId("");
                    setNewRecipientName("");
                    setNewRecipientVerified(null);
                    setAddRecipientModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-slate-800/90 border border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300 transition"
                >
                  <UserPlus className="h-3 w-3 text-cyan-400" />
                  Add
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRecipientSearch("");
                    setViewAllRecipientsOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 px-2.5 py-1 text-[11px] font-extrabold text-cyan-300 hover:bg-cyan-500/25 transition"
                >
                  View all ({savedRecipients.length})
                </button>
              </div>
            </div>

            {topRecipients.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topRecipients.map((saved) => {
                  const isSelected =
                    verifiedRecipient?.vevu_id.toUpperCase() ===
                    saved.recipient.trim().toUpperCase();

                  return (
                    <div
                      key={saved.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSavedRecipient(saved)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handleSelectSavedRecipient(saved);
                        }
                      }}
                      className={`group flex items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-400 text-white"
                          : "bg-slate-950/90 border-slate-800 text-slate-300 hover:border-cyan-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-extrabold text-cyan-300">
                          {saved.beneficiary_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {saved.beneficiary_name}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 truncate">
                            {saved.recipient}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleRequestRemoveRecipient(e, saved)}
                        aria-label={`Remove ${saved.beneficiary_name}`}
                        className="shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              !loadingRecipients && (
                <p className="text-xs text-slate-500">
                  No saved recipients yet. Tap <strong className="text-slate-300">Add</strong> or complete a transfer to save one.
                </p>
              )
            )}
          </div>

          <div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Recipient Vevu ID
            </label>

            <div className="flex gap-2">

              <input
                type="text"
                placeholder="e.g. VP47565202"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value.toUpperCase());
                  setVerifiedRecipient(null);
                  setTransferId(null);
                  setRequestKey(null);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-mono font-bold text-sm tracking-wide shadow-inner"
                required
              />

              <button
                type="button"
                onClick={handleVerifyRecipient}
                disabled={
                  verifying ||
                  !identifier.trim()
                }
                className="px-5 rounded-2xl bg-slate-800 border border-slate-700 text-cyan-300 font-bold text-xs hover:bg-slate-700 transition disabled:opacity-50 shrink-0 flex items-center gap-1.5"
              >

                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCheck className="h-4 w-4" />
                )}

                Verify

              </button>

            </div>

            {verifiedRecipient && (

              <div className="mt-3 flex items-center justify-between px-4 py-3 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 animate-fadeIn">

                <div className="flex items-center gap-2.5">

                  <div className="p-1.5 rounded-full bg-cyan-500/20 text-cyan-400">
                    <Check className="h-4 w-4" />
                  </div>

                  <div>

                    <p className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                      Recipient Verified
                    </p>

                    <p className="text-sm font-extrabold text-white">
                      {verifiedRecipient.full_name}

                      <span className="font-mono text-xs text-slate-400 ml-1">
                        ({verifiedRecipient.vevu_id})
                      </span>
                    </p>

                  </div>

                </div>

              </div>

            )}

          </div>

          {/* AMOUNT */}

          <div>

            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Amount (₦)
              </label>
              <span className="text-[11px] text-cyan-300 font-semibold">
                Min {formatNaira(MIN_TRANSFER_AMOUNT)} · Cap now: {formatNaira(effectiveInputCap)}
              </span>
            </div>

            <div className="relative">

              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                ₦
              </span>

              <input
                type="number"
                min={MIN_TRANSFER_AMOUNT}
                max={maxAllowedByTier > 0 ? maxAllowedByTier : undefined}
                step="0.01"
                placeholder="100.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-4 py-3.5 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 font-extrabold text-lg shadow-inner"
                required
              />

            </div>

            {limitNotice && (
              <p className="mt-2 text-xs text-amber-300">
                {limitNotice}
              </p>
            )}

          </div>

          {/* NARRATION */}

          <div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Note / Narration (Optional)
            </label>

            <input
              type="text"
              placeholder="What's this for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 text-sm shadow-inner"
              maxLength={100}
            />

          </div>

          <button
            type="submit"
            disabled={!verifiedRecipient || verifying || checkingPinStatus || allowance.is_frozen}
            className="w-full mt-2 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-4 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition disabled:opacity-50"
          >

            {checkingPinStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}

            Proceed to Transfer

          </button>

        </form>

      )}

      {/* VIEW ALL RECIPIENTS MODAL */}

      {viewAllRecipientsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All saved recipients"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm"
          onClick={() => {
            setViewAllRecipientsOpen(false);
            setRecipientSearch("");
          }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-white">
                  All Recipients ({savedRecipients.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Search by name or Vevu ID (e.g. VP769)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewRecipientVevuId("");
                    setNewRecipientName("");
                    setNewRecipientVerified(null);
                    setAddRecipientModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 px-3 py-1.5 text-xs font-extrabold text-cyan-300 hover:bg-cyan-500/25 transition"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewAllRecipientsOpen(false);
                    setRecipientSearch("");
                  }}
                  aria-label="Close recipients list"
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-4 border-b border-slate-800/80">
              <div className="relative">
                <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="Search name or Vevu ID (e.g. VP769)..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-9 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                {recipientSearch && (
                  <button
                    type="button"
                    onClick={() => setRecipientSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 overflow-y-auto space-y-2 flex-1">
              {filteredRecipients.length > 0 ? (
                filteredRecipients.map((saved) => {
                  const isSelected =
                    verifiedRecipient?.vevu_id.toUpperCase() ===
                    saved.recipient.trim().toUpperCase();

                  return (
                    <div
                      key={saved.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSavedRecipient(saved)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handleSelectSavedRecipient(saved);
                        }
                      }}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 transition cursor-pointer ${
                        isSelected
                          ? "bg-cyan-500/15 border-cyan-400 text-white"
                          : "bg-slate-950/90 border-slate-800 text-slate-200 hover:border-cyan-500/40"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-extrabold text-cyan-300">
                          {saved.beneficiary_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">
                            {saved.beneficiary_name}
                          </p>
                          <p className="text-xs font-mono text-slate-400 truncate">
                            {saved.recipient}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleRequestRemoveRecipient(e, saved)}
                        aria-label={`Remove ${saved.beneficiary_name}`}
                        className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-300">
                    No matching recipients
                  </p>
                  <p className="text-xs text-slate-500">
                    {recipientSearch.trim()
                      ? `Nothing matched "${recipientSearch.trim()}".`
                      : "You haven't saved any transfer recipients yet."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW RECIPIENT MODAL */}

      {addRecipientModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add recipient"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setAddRecipientModalOpen(false)}
        >
          <form
            onSubmit={handleAddManualRecipient}
            className="w-full max-w-sm rounded-3xl border border-cyan-500/30 bg-slate-900 p-6 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-cyan-400" />
                Add Recipient
              </h3>
              <button
                type="button"
                onClick={() => setAddRecipientModalOpen(false)}
                aria-label="Close add recipient modal"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Recipient Vevu ID
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRecipientVevuId}
                  onChange={(e) => {
                    setNewRecipientVevuId(e.target.value.toUpperCase());
                    setNewRecipientVerified(null);
                  }}
                  placeholder="e.g. VP47565202"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-white text-sm font-mono font-bold focus:outline-none focus:border-cyan-500"
                  required
                />
                <button
                  type="button"
                  onClick={handleVerifyNewRecipient}
                  disabled={verifyingNewRecipient || !newRecipientVevuId.trim()}
                  className="px-3.5 rounded-2xl bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold hover:bg-slate-700 disabled:opacity-50 shrink-0"
                >
                  {verifyingNewRecipient ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </button>
              </div>

              {newRecipientVerified && (
                <p className="mt-1.5 text-xs font-semibold text-cyan-300">
                  Verified: {newRecipientVerified.full_name} ({newRecipientVerified.vevu_id})
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Label / Name (Optional)
              </label>
              <input
                type="text"
                value={newRecipientName}
                onChange={(e) => setNewRecipientName(e.target.value)}
                placeholder={newRecipientVerified?.full_name || "e.g. Alex"}
                maxLength={60}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setAddRecipientModalOpen(false)}
                disabled={addingManualRecipient}
                className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={addingManualRecipient || verifyingNewRecipient}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition disabled:opacity-50"
              >
                {addingManualRecipient ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* REMOVE RECIPIENT CONFIRMATION POPUP */}

      {pendingRemoveRecipient && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Remove recipient confirmation"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 text-white shadow-2xl space-y-5">
            <div className="text-center space-y-1.5">
              <h3 className="text-lg font-bold text-white">
                Remove from recipients?
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Remove{" "}
                <strong className="text-slate-200">
                  {pendingRemoveRecipient.beneficiary_name}
                </strong>{" "}
                (<span className="font-mono">{pendingRemoveRecipient.recipient}</span>)
                from your saved recipients list?
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingRemoveRecipient(null)}
                disabled={removingRecipient}
                className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
              >
                No
              </button>

              <button
                type="button"
                onClick={handleConfirmRemoveRecipient}
                disabled={removingRecipient}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-rose-500 py-3 text-sm font-extrabold text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition disabled:opacity-50"
              >
                {removingRecipient ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Yes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SET UP YOUR PIN FIRST PROMPT */}

      {pinSetupPromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Set up transaction PIN"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-6 text-white shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400">
              <KeyRound className="h-6 w-6" />
            </div>

            <h3 className="text-center text-lg font-bold text-white">
              Set up your PIN first
            </h3>

            <p className="mt-1.5 text-center text-xs text-slate-400 leading-relaxed">
              Create a 6-digit transaction PIN before sending a wallet transfer.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPinSetupPromptOpen(false)}
                className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setPinSetupPromptOpen(false);
                  navigate({ to: "/security", search: { setupPin: "1" } });
                }}
                className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition"
              >
                Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD TO RECIPIENTS POPUP */}

      {saveRecipientModalOpen && (confirmedSuccessRecipient || verifiedRecipient) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add to recipients"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <form
            onSubmit={handleSaveRecipient}
            className="w-full max-w-sm rounded-3xl border border-cyan-500/30 bg-slate-900 p-6 text-white shadow-2xl space-y-4"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-400">
              <UserPlus className="h-6 w-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">
                Add to Recipients?
              </h3>
              <p className="text-xs text-slate-400">
                Save{" "}
                <strong className="text-cyan-300">
                  {(confirmedSuccessRecipient || verifiedRecipient)!.full_name}
                </strong>{" "}
                (
                <span className="font-mono">
                  {(confirmedSuccessRecipient || verifiedRecipient)!.vevu_id}
                </span>
                ) for faster one-tap transfers next time.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Recipient Name
              </label>
              <input
                type="text"
                value={recipientAlias}
                onChange={(e) => setRecipientAlias(e.target.value)}
                placeholder={(confirmedSuccessRecipient || verifiedRecipient)!.full_name}
                maxLength={60}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setSaveRecipientModalOpen(false)}
                disabled={savingRecipient}
                className="flex-1 rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Skip
              </button>

              <button
                type="submit"
                disabled={savingRecipient}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition disabled:opacity-50"
              >
                {savingRecipient ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save Recipient"
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: SIX-DIGIT PIN CONFIRMATION */}

      {step === "pin" && (

        <form
          onSubmit={handleInitiateTransfer}
          className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-5 shadow-xl backdrop-blur text-center"
        >

          <div className="mx-auto w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-2">
            <Lock className="h-6 w-6" />
          </div>

          <h2 className="text-lg font-bold text-white">
            Enter Transaction PIN
          </h2>

          <p className="text-xs text-slate-400">
            Enter your 6-digit PIN to authorize
            transferring ₦
            {Number(amount).toLocaleString("en-NG")}
            {" "}to{" "}

            <span className="text-cyan-300 font-bold">
              {verifiedRecipient?.full_name}
            </span>
          </p>

          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            placeholder="••••••"
            value={pin}
            onChange={(e) =>
              setPin(
                e.target.value.replace(/\D/g, "").slice(0, 6)
              )
            }
            className="w-48 mx-auto bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-center text-white text-2xl tracking-widest focus:outline-none focus:border-cyan-500 font-mono shadow-inner"
            required
            autoFocus
          />

          <div className="flex gap-3 pt-2">

            <button
              type="button"
              onClick={() => {
                setStep("input");
                setPin("");
              }}
              disabled={loading}
              className="w-1/2 rounded-2xl bg-slate-800 py-3.5 text-sm font-bold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
            >
              Back
            </button>

            <button
              type="submit"
              disabled={loading || pin.length !== 6}
              className="w-1/2 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 transition disabled:opacity-50"
            >

              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "Confirm Transfer"
              )}

            </button>

          </div>

        </form>

      )}

      {/* STEP 3: SUCCESS SCREEN */}

      {step === "success" && (

        <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-8 space-y-6 shadow-2xl backdrop-blur text-center animate-fadeIn">

          <div className="space-y-2">

            <span className="inline-block px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              Transfer to {confirmedSuccessRecipient?.full_name || verifiedRecipient?.full_name}
            </span>

            <h2 className="text-2xl font-black text-white">
              ₦
              {Number(confirmedSuccessAmount || amount || 0).toLocaleString("en-NG", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h2>

          </div>

          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/30 animate-bounce">

            <CheckCircle2 className="h-10 w-10 text-slate-950 stroke-[2.5]" />

          </div>

          <div className="space-y-1">

            <p className="text-sm font-bold text-emerald-400">
              Transfer Successful!
            </p>

            <p className="text-xs text-slate-400">
              Funds have been credited instantly to
              the recipient's wallet.
            </p>

            {transferReference && (
              <p className="text-xs text-slate-500 pt-2 break-all">
                Reference: {transferReference}
              </p>
            )}

          </div>

          <div className="pt-4 flex flex-col gap-3">

            <Link
              to="/dashboard"
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-extrabold text-sm shadow-lg shadow-cyan-500/20 hover:brightness-110 transition block"
            >
              Back to Dashboard
            </Link>

          </div>

        </div>

      )}

    </div>
  );
}
