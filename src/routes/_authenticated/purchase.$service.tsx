// src/routes/_authenticated/purchase.$service.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  Gift,
  X,
  ShieldAlert,
  Ticket,
  Clock,
  Check,
  ChevronDown,
  ArrowLeft,
  ShieldCheck,
  KeyRound,
  History,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { callEdgeFunction, supabase } from "@/lib/supabase";
import { fetchWalletBalance } from "@/lib/user-data";
import { PageHeader } from "@/components/PageHeader";
import { detectNetworkSlug, detectNetworkName } from "@/lib/network-detector";
import { SuccessScreen } from "@/components/SuccessScreen";
import { ErrorPopup } from "@/components/ErrorPopup";

type CouponInfo = {
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  max_discount: number | null;
  service_target?: string | null;
};

type ServiceKey = "airtime" | "data" | "tv" | "electricity" | "bet" | "education";

const MAX_AMOUNTS: Record<ServiceKey, number> = {
  airtime: 50000,
  data: 0,
  tv: 0,
  electricity: 500000,
  bet: 100000,
  education: 10,
};

const AIRTIME_QUICK_AMOUNTS = [100, 200, 300, 400, 500, 1000];
const ELECTRICITY_QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 10000, 20000];

const config: Record<
  ServiceKey,
  {
    label: string;
    recipientLabel: string;
    showAmount: boolean;
    showPlans: boolean;
    minAmount?: number;
    blurb: string;
    pairgateType: string;
    requiresVerification: boolean;
    verifyEndpoint: string;
  }
> = {
  airtime: {
    label: "Airtime",
    recipientLabel: "Phone number",
    showAmount: true,
    showPlans: false,
    minAmount: 50,
    blurb: "Top up any Nigerian line in seconds.",
    pairgateType: "airtime",
    requiresVerification: false,
    verifyEndpoint: "",
  },
  data: {
    label: "Data bundle",
    recipientLabel: "Phone number",
    showAmount: false,
    showPlans: true,
    blurb: "Pick a bundle from your network.",
    pairgateType: "data",
    requiresVerification: false,
    verifyEndpoint: "",
  },
  tv: {
    label: "Cable TV",
    recipientLabel: "Smartcard / IUC number",
    showAmount: false,
    showPlans: true,
    blurb: "DSTV, GOTV, Startimes and more.",
    pairgateType: "tv",
    requiresVerification: true,
    verifyEndpoint: "/cable/verify",
  },
  electricity: {
    label: "Electricity",
    recipientLabel: "Meter number",
    showAmount: true,
    showPlans: false,
    minAmount: 1000,
    blurb: "Prepaid & postpaid meters supported.",
    pairgateType: "electricity",
    requiresVerification: true,
    verifyEndpoint: "/electricity/verify",
  },
  bet: {
    label: "Betting",
    recipientLabel: "Customer ID",
    showAmount: true,
    showPlans: false,
    minAmount: 100,
    blurb: "Fund your betting wallet instantly.",
    pairgateType: "bet",
    requiresVerification: true,
    verifyEndpoint: "/bet/verify",
  },
  education: {
    label: "Exam pins",
    recipientLabel: "",
    showAmount: true,
    showPlans: false,
    minAmount: 1,
    blurb: "WAEC, NECO, NABTEB pins on demand.",
    pairgateType: "education",
    requiresVerification: false,
    verifyEndpoint: "",
  },
};

interface Provider {
  id: string;
  slug: string;
  name: string;
}

interface Plan {
  plan_id: string | number;
  name: string;
  price: number;
  duration?: number | null;
}

interface VerificationResult {
  verified: boolean;
  customerName?: string;
  error?: string;
}

interface RecentRecipient {
  recipient: string;
  providerSlug: string;
  customerName: string | null;
  meterType: "prepaid" | "postpaid" | null;
}

const PROVIDER_SLUG_MAP: Record<string, string> = {
  "MTN": "mtn",
  "Airtel": "airtel",
  "Glo": "glo",
  "9mobile": "9mobile",
  "DSTV": "dstv",
  "GOtv": "gotv",
  "Startimes": "startimes",
  "Ikeja Electricity - IKEDC (PHCN)": "ikedc",
  "Eko Electricity - EKEDC (PHCN)": "eko",
  "Enugu Electricity - EEDC": "enugu",
  "Yola Electricity - YEDC": "yola",
  "Benin Electricity - BEDC": "benin",
  "PortHarcourt Electricity - PHEDC": "ph",
  "Aba Electricity - ABA": "aba",
  "Abuja Electricity - AEDC": "aedc",
  "Kaduna Electricity - KAEDC": "kaduna",
  "Kano Electricity - KEDCO": "kedco",
  "Ibadan Electricity - IBEDC": "ibedc",
  "Jos Electricity - JEDC": "jedc",
  "Accessbet": "accessbet",
  "Bet9ja": "bet9ja",
  "Betking": "betking",
  "Betway": "betway",
  "Sportybet": "sportybet",
  "Nairabet": "nairabet",
  "WAEC": "waec",
  "NECO": "neco",
  "NABTEB": "nabt",
};

const getCleanErrorMessage = (err: any): string => {
  if (!err) return "An unknown error occurred";
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err);
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
    } catch {
      return err;
    }
    return err;
  }
  let msg = err.message || err.toString() || "An unknown error occurred";
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
    } catch {
      // ignore
    }
  }
  msg = msg.replace(/^Server error: \d+ - /, "");
  return msg;
};

const formatPlanDuration = (duration: Plan["duration"], serviceKey: ServiceKey): string | null => {
  const days = Number(duration);
  if (Number.isFinite(days) && days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (serviceKey === "tv") return "1 Month";
  return null;
};

const normalizeRecipientKey = (value: string) => value.replace(/\s+/g, "").trim().toLowerCase();

const createAttemptReference = (serviceKey: string) => {
  const randomSuffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return `${serviceKey}_${randomSuffix}`;
};

export const Route = createFileRoute("/_authenticated/purchase/$service")({
  head: ({ params }) => ({ meta: [{ title: `Buy ${params.service} — VevuPay` }] }),
  component: PurchasePage,
});

function PurchasePage() {
  const { service } = Route.useParams();
  const key = service as ServiceKey;
  const cfg = config[key];
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planCategories, setPlanCategories] = useState<{ provider_name: string; plan_type: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [providerUuid, setProviderUuid] = useState("");
  const [providerSlug, setProviderSlug] = useState("");
  const [planId, setPlanId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [meterType, setMeterType] = useState<"prepaid" | "postpaid">("prepaid");
  const [loading, setLoading] = useState(false);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [educationPrice, setEducationPrice] = useState<{ unit_price: number; total_amount: number } | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  const priceRequestId = useRef(0);
  const verifyRequestId = useRef(0);
  const planRequestId = useRef(0);

  // Idempotency & concurrency guards for purchase submissions
  const submitInFlightRef = useRef(false);
  const attemptReferenceRef = useRef<string | null>(null);

  useEffect(() => {
    attemptReferenceRef.current = null;
  }, [key, providerSlug, planId, selectedCategory, amount, recipient, meterType]);

  // Reset service-specific selection state whenever the route service changes
  useEffect(() => {
    planRequestId.current += 1;
    verifyRequestId.current += 1;
    priceRequestId.current += 1;
    setProviderUuid("");
    setProviderSlug("");
    setPlanId("");
    setPlans([]);
    setSelectedCategory("");
    setPlanCategories([]);
    setAmount("");
    setRecipient("");
    setMeterType("prepaid");
    setErrorMessage(null);
    setPriceError(null);
    setEducationPrice(null);
    setVerificationResult(null);
    setIsVerified(false);
    setSelectedCoupon("");
    setCouponCode("");
    setCustomCouponInput("");
    setStep(1);
    setShowProviderModal(false);
    setAirtimeNetworkMenuOpen(false);
  }, [key]);

  // --- PIN SETUP PROMPT & PIN MODAL STATES ---
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [checkingPinStatus, setCheckingPinStatus] = useState(false);
  const [pinSetupPromptOpen, setPinSetupPromptOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const [selectedCoupon, setSelectedCoupon] = useState<string>("");
  const [couponCode, setCouponCode] = useState<string>("");
  const [customCouponInput, setCustomCouponInput] = useState<string>("");
  const [useCashback, setUseCashback] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successAmount, setSuccessAmount] = useState(0);
  const [apiError, setApiError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [airtimeNetworkMenuOpen, setAirtimeNetworkMenuOpen] = useState(false);

  const closePinModal = () => {
    setPinModalOpen(false);
    setTransactionPin("");
    setPinError(null);
  };

  const { data: wallet } = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: () => fetchWalletBalance(user!.id),
  });

  const walletBalance = Number(wallet?.balance ?? 0);
  const cashbackBalance = Number(wallet?.cashback_balance ?? 0);
  const cashbackAvailable = cashbackBalance > 0;

  const { data: welcomeDiscountAvailable = false } = useQuery({
    queryKey: ["profile-welcome", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vp_welcome_discount_available", { p_user_id: user!.id });
      if (error) throw error;
      return data === true;
    },
    refetchInterval: 30000,
  });

  const getSlugFromName = (name: string): string =>
    PROVIDER_SLUG_MAP[name] || name.toLowerCase().replace(/\s+/g, "");

  const { data: availableCoupons } = useQuery({
    queryKey: ["available-coupons", user?.id, key],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_coupons")
        .select(`id, expires_at, coupons (code, discount_type, discount_value, min_purchase, max_discount, service_target)`)
        .eq("user_id", user!.id)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString());
      if (error) throw error;
      return (data || [])
        .map((row: any) => {
          const c = Array.isArray(row.coupons) ? row.coupons[0] : row.coupons;
          return {
            id: row.id as string,
            expires_at: row.expires_at as string,
            coupons: c as CouponInfo | null,
          };
        })
        .filter((row) => {
          if (!row.coupons) return false;
          const target = (row.coupons.service_target || "all").trim().toLowerCase() || "all";
          return target === "all" || target === key;
        });
    },
  });

  const { data: recentRecipients = [] } = useQuery<RecentRecipient[]>({
    queryKey: ["recent-purchase-recipients", user?.id, key],
    enabled: !!user && key !== "education",
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("recipient, status, provider_slug, meta, metadata, created_at")
        .eq("user_id", user!.id)
        .eq("type", key)
        .order("created_at", { ascending: false })
        .limit(40);

      if (error || !Array.isArray(data)) return [];

      const seen = new Set<string>();
      const recent: RecentRecipient[] = [];

      for (const row of data as Array<Record<string, any>>) {
        const status = String(row?.status ?? "success").toLowerCase();
        if (status.includes("fail")) continue;

        const rawRecipient = String(
          row?.recipient ??
            row?.metadata?.recipient ??
            row?.meta?.recipient ??
            row?.metadata?.meter_number ??
            row?.meta?.meter_number ??
            row?.metadata?.smartcard ??
            row?.meta?.smartcard ??
            row?.metadata?.customer_id ??
            row?.meta?.customer_id ??
            ""
        ).trim();

        if (!rawRecipient) continue;

        const dedupeKey = normalizeRecipientKey(rawRecipient);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const slug = String(
          row?.provider_slug ??
            row?.metadata?.provider_id ??
            row?.meta?.provider_id ??
            row?.metadata?.provider ??
            row?.meta?.provider ??
            ""
        )
          .trim()
          .toLowerCase();

        const rawCustomer =
          row?.metadata?.customer_name ?? row?.meta?.customer_name ?? null;

        const rawMeter =
          row?.metadata?.meter_type ?? row?.meta?.meter_type ?? null;
        const parsedMeter: "prepaid" | "postpaid" | null =
          rawMeter === 2 || String(rawMeter).toLowerCase() === "postpaid"
            ? "postpaid"
            : rawMeter === 1 || String(rawMeter).toLowerCase() === "prepaid"
            ? "prepaid"
            : null;

        recent.push({
          recipient: rawRecipient,
          providerSlug: slug,
          customerName:
            typeof rawCustomer === "string" && rawCustomer.trim()
              ? rawCustomer.trim()
              : null,
          meterType: parsedMeter,
        });

        if (recent.length === 3) break;
      }

      return recent;
    },
  });

  const checkUserHasPin = async (): Promise<boolean | null> => {
    if (!user) return null;
    setCheckingPinStatus(true);
    try {
      const res = await callEdgeFunction<any>("get-transaction-pin-status", {});
      if (typeof res?.hasPin === "boolean") {
        setHasPin(res.hasPin);
        return res.hasPin;
      }
      return hasPin;
    } catch {
      return hasPin;
    } finally {
      setCheckingPinStatus(false);
    }
  };

  const validatePhoneNumber = (phone: string) => {
    const clean = phone.replace(/\D/g, "");
    if (clean.length !== 11 && clean.length !== 13) return { valid: false, error: "Phone number must be 11 digits" };
    const numberStr = clean.length === 13 ? clean.slice(3) : clean;
    if (!numberStr.startsWith("0")) return { valid: false, error: "Phone number must start with 0" };
    return { valid: true, cleaned: clean };
  };

  const verifyCustomer = async () => {
    if (!cfg?.requiresVerification) return;
    if (!providerSlug || !recipient) {
      toast.error("Please select a provider and enter the recipient details");
      return;
    }
    const reqId = ++verifyRequestId.current;
    setVerifying(true);
    setVerificationResult(null);
    setIsVerified(false);
    try {
      const payload: Record<string, unknown> = { service: key, action: "verify", provider_id: providerSlug };
      if (key === "electricity") {
        payload.meter_number = recipient.replace(/\D/g, "");
        payload.meter_type = meterType === "prepaid" ? 1 : 2;
      } else if (key === "tv") {
        payload.smartcard = recipient.replace(/\D/g, "");
      } else if (key === "bet") {
        payload.customer_id = recipient.trim();
      }
      const result = await callEdgeFunction<any>("purchase", payload);
      if (verifyRequestId.current !== reqId) return;
      const name = String(result?.customer_name || "").trim();
      if (result?.status === true && name.length > 1) {
        setVerificationResult({ verified: true, customerName: name });
        setIsVerified(true);
        toast.success(`Verified: ${name}`);
      } else {
        setVerificationResult({ verified: false, error: result?.error || "Could not verify" });
        setIsVerified(false);
        toast.error("Verification failed.");
      }
    } catch (err: any) {
      if (verifyRequestId.current === reqId) {
        setVerificationResult({ verified: false, error: getCleanErrorMessage(err) });
        setIsVerified(false);
        toast.error(getCleanErrorMessage(err));
      }
    } finally {
      if (verifyRequestId.current === reqId) {
        setVerifying(false);
      }
    }
  };

  useEffect(() => {
    if (!user) return;
    void checkUserHasPin();
  }, [user]);

  useEffect(() => {
    if (!cfg) return;
    let cancelled = false;
    const fetchProviders = async () => {
      setLoadingProviders(true);
      setErrorMessage(null);
      try {
        const res = await callEdgeFunction<any>("purchase", {
          action: "get-providers",
          path: `/providers/${cfg.pairgateType}`,
        });
        if (!cancelled && res?.data && Array.isArray(res.data)) {
          setProviders(
            res.data.map((p: any) => ({
              id: p.id,
              name: p.name,
              slug: p.slug || getSlugFromName(p.name),
            }))
          );
        }
      } catch (err: any) {
        if (!cancelled) setErrorMessage(getCleanErrorMessage(err));
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    };
    fetchProviders();
    return () => {
      cancelled = true;
    };
  }, [cfg?.pairgateType, key]);

  const fetchPlans = async (slug: string, category: string) => {
    const reqId = ++planRequestId.current;
    setLoadingPlans(true);
    try {
      let res;
      if (key === "tv") {
        res = await callEdgeFunction<any>("purchase", {
          action: "get-providers",
          path: `/cable-plans?provider_id=${slug}`,
        });
      } else if (key === "data") {
        res = await callEdgeFunction<any>("purchase", {
          action: "get_plans",
          provider_id: slug,
          plan_type: category,
        });
      } else {
        if (planRequestId.current === reqId) setPlans([]);
        return;
      }
      if (planRequestId.current !== reqId) return;
      if (res?.data && typeof res.data === "object") {
        const keys = Object.keys(res.data);
        if (keys.length > 0 && Array.isArray(res.data[keys[0]])) {
          setPlans(
            res.data[keys[0]].map((p: any) => ({
              ...p,
              plan_id: String(p.plan_id),
              price: Math.floor(Number(p.price)),
            }))
          );
        } else {
          setPlans([]);
        }
      } else {
        setPlans([]);
      }
    } catch (err: any) {
      if (planRequestId.current === reqId) {
        setPlans([]);
        toast.error(getCleanErrorMessage(err));
      }
    } finally {
      if (planRequestId.current === reqId) {
        setLoadingPlans(false);
      }
    }
  };

  const fetchEducationPrice = async (slug: string, qty: number) => {
    if (!slug) return;
    const requestId = ++priceRequestId.current;
    setLoadingPrice(true);
    setPriceError(null);
    setEducationPrice(null);
    try {
      const res = await callEdgeFunction<any>("purchase", {
        action: "get_education_price",
        provider_id: slug,
        quantity: Math.floor(qty),
      });
      if (priceRequestId.current !== requestId) return;
      if (res && res.success && res.unit_price) {
        setEducationPrice({
          unit_price: Math.floor(res.unit_price),
          total_amount: Math.floor(res.total_amount),
        });
      } else {
        setPriceError(res?.error || "Failed to fetch price");
      }
    } catch (err: any) {
      if (priceRequestId.current === requestId) setPriceError(getCleanErrorMessage(err));
    } finally {
      if (priceRequestId.current === requestId) setLoadingPrice(false);
    }
  };

  const onProviderChange = async (val: string) => {
    verifyRequestId.current += 1;
    setProviderUuid(val);
    setPlanId("");
    setPlans([]);
    setSelectedCategory("");
    setPlanCategories([]);
    setErrorMessage(null);
    setPriceError(null);
    setEducationPrice(null);
    setVerificationResult(null);
    setIsVerified(false);
    setStep(1);
    const selectedProvider = providers.find((p) => p.id === val);
    if (!selectedProvider) {
      setProviderSlug("");
      return;
    }
    const slug = selectedProvider.slug || getSlugFromName(selectedProvider.name);
    setProviderSlug(slug);
    if (key === "education") {
      await fetchEducationPrice(slug, Number(amount) || 1);
    } else if (key === "data") {
      try {
        const res = await callEdgeFunction<any>("purchase", { action: "get_categories" });
        if (res?.data) {
          const targetName = selectedProvider.name.trim().toUpperCase();
          const filtered = res.data.filter(
            (c: any) => (c.provider_name?.trim().toUpperCase() || "") === targetName || c.provider_id === val
          );
          setPlanCategories(filtered);
          const defaultCat =
            filtered.find((c: any) => c.plan_type === "CG")?.plan_type ||
            filtered.find((c: any) => c.plan_type === "SME")?.plan_type ||
            filtered[0]?.plan_type;
          if (defaultCat) {
            setSelectedCategory(defaultCat);
            await fetchPlans(slug, defaultCat);
          }
        }
      } catch (err: any) {
        toast.error(getCleanErrorMessage(err));
      }
    } else if (key === "tv") {
      await fetchPlans(slug, "");
    }
  };

  const onCategoryChange = async (category: string) => {
    setSelectedCategory(category);
    setPlanId("");
    setStep(1);
    if (providerSlug) await fetchPlans(providerSlug, category);
  };

  const handleRecipientChange = (value: string) => {
    setRecipient(value);
    if ((key === "airtime" || key === "data") && !providerUuid && !providerSlug) {
      const clean = value.replace(/\D/g, "");
      if (clean.length >= 10) {
        const slug = detectNetworkSlug(value);
        if (slug) {
          const matched = providers.find((p) => p.slug?.toLowerCase() === slug.toLowerCase());
          if (matched) {
            void onProviderChange(matched.id);
          }
        }
      }
    }
  };

  const handleSelectRecentRecipient = async (item: RecentRecipient) => {
    setRecipient(item.recipient);
    if (key === "electricity" && item.meterType) {
      setMeterType(item.meterType);
    }
    setVerificationResult(null);
    setIsVerified(false);

    const targetSlug =
      item.providerSlug ||
      ((key === "airtime" || key === "data") ? detectNetworkSlug(item.recipient) || "" : "");

    if (targetSlug && targetSlug.toLowerCase() !== providerSlug.toLowerCase()) {
      const matched = providers.find(
        (p) =>
          p.slug.toLowerCase() === targetSlug.toLowerCase() ||
          getSlugFromName(p.name).toLowerCase() === targetSlug.toLowerCase()
      );
      if (matched) {
        await onProviderChange(matched.id);
      }
    }
  };

  useEffect(() => {
    if (key === "education" && providerSlug && amount) {
      const qty = Number(amount) || 1;
      if (qty >= 1 && qty <= 10) fetchEducationPrice(providerSlug, Math.floor(qty));
    }
  }, [amount]);

  useEffect(() => {
    if (cfg?.requiresVerification && recipient) {
      verifyRequestId.current += 1;
      setVerificationResult(null);
      setIsVerified(false);
    }
  }, [recipient, cfg?.requiresVerification]);

  useEffect(() => {
    if (key === "electricity") {
      verifyRequestId.current += 1;
      setVerificationResult(null);
      setIsVerified(false);
    }
  }, [meterType, key]);

  const detectedSlug = useMemo(() => {
    if (key === "airtime" || key === "data") {
      return detectNetworkSlug(recipient);
    }
    return null;
  }, [recipient, key]);

  const isNetworkMismatch = useMemo(() => {
    if (!providerSlug || !detectedSlug) return false;
    return detectedSlug.toLowerCase() !== providerSlug.toLowerCase();
  }, [detectedSlug, providerSlug]);

  const selectedProviderName =
    providers.find((p) => p.slug.toLowerCase() === providerSlug.toLowerCase())?.name || providerSlug;

  const validate = (): string | null => {
    if (!cfg) return "Invalid service";
    if (!providerUuid) return "Choose a provider";
    if (cfg.showPlans && !planId) return "Choose a plan";
    if (cfg.showAmount && (!amount || Number(amount) < (cfg.minAmount ?? 1))) {
      return `Enter at least ₦${cfg.minAmount ?? 1}`;
    }
    if (key !== "education" && !recipient) return `${cfg.recipientLabel} is required`;
    if ((key === "airtime" || key === "data") && recipient) {
      const result = validatePhoneNumber(recipient);
      if (!result.valid) return result.error;
    }
    if (cfg.requiresVerification && !isVerified) return `Please verify the ${cfg.recipientLabel} first`;
    const maxAmount = MAX_AMOUNTS[key];
    const currentAmount = Number(amount) || 0;
    if (maxAmount > 0 && currentAmount > maxAmount) {
      return `Maximum ${cfg.label} is ${key === "education" ? maxAmount + " pins" : "₦" + maxAmount.toLocaleString()}`;
    }
    if (key === "education" && !educationPrice && !loadingPrice) return "Unable to fetch price.";
    return null;
  };

  const basePriceForQuery = useMemo(() => {
    if (!cfg) return 0;
    if (cfg.showPlans) {
      return Math.floor(Number(plans.find((pl) => String(pl.plan_id) === planId)?.price ?? 0));
    }
    if (key === "education") return educationPrice?.total_amount || 0;
    return Math.floor(Number(amount || 0));
  }, [cfg, plans, planId, amount, key, educationPrice]);

  const { data: priceData, isLoading: loadingPriceData } = useQuery({
    queryKey: [
      "final-price",
      key,
      basePriceForQuery,
      providerUuid,
      selectedCategory,
      planId,
      amount,
      meterType,
      selectedCoupon,
      useCashback,
      welcomeDiscountAvailable,
    ],
    enabled: basePriceForQuery > 0,
    queryFn: async () =>
      await callEdgeFunction<any>("purchase", {
        action: "get_final_price",
        service: key,
        base_price: basePriceForQuery,
      }),
    staleTime: 0,
  });

  const subtotal = loadingPriceData ? 0 : priceData?.final_price ?? basePriceForQuery;
  const welcomeDiscount =
    welcomeDiscountAvailable && subtotal >= 500 ? Math.min(20, Math.floor(subtotal * 0.01)) : 0;
  const displayTotal = Math.max(0, subtotal - welcomeDiscount);

  const activeCouponCode = useMemo(() => {
    const manual = customCouponInput.trim().toUpperCase();
    if (manual) return manual;
    return couponCode.trim().toUpperCase();
  }, [customCouponInput, couponCode]);

  const {
    data: couponPreviewData,
    isFetching: previewingCoupon,
    error: couponPreviewError,
  } = useQuery({
    queryKey: ["coupon-preview", user?.id, key, activeCouponCode, displayTotal],
    enabled: !!user && !!activeCouponCode && displayTotal > 0,
    retry: false,
    staleTime: 0,
    queryFn: async () => {
      const res = await callEdgeFunction<any>("purchase", {
        action: "preview_coupon",
        service: key,
        coupon_code: activeCouponCode,
        amount: displayTotal,
      });
      if (!res?.success) {
        throw new Error(res?.error || "Coupon is not valid for this order.");
      }
      return res as {
        code: string;
        coupon_id: string | null;
        user_coupon_id: string | null;
        discount_type: string | null;
        discount: number;
        discount_amount: number;
        final_amount: number;
      };
    },
  });

  const couponDiscountPreview =
    activeCouponCode && !couponPreviewError
      ? Math.min(
          displayTotal,
          Math.max(0, Number(couponPreviewData?.discount_amount ?? couponPreviewData?.discount ?? 0))
        )
      : 0;

  const amountAfterCoupon =
    activeCouponCode && !couponPreviewError && couponPreviewData?.final_amount != null
      ? Math.max(0, Number(couponPreviewData.final_amount))
      : Math.max(0, displayTotal - couponDiscountPreview);

  const cashbackUsedPreview = useCashback && cashbackAvailable ? Math.min(cashbackBalance, amountAfterCoupon) : 0;
  const walletChargePreview = amountAfterCoupon - cashbackUsedPreview;
  const isInsufficient = displayTotal > 0 && walletChargePreview > walletBalance;

  const submitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || submitInFlightRef.current || loading) return;
    if (loadingPriceData) {
      toast.error("Please wait while we calculate the final price...");
      return;
    }
    if (previewingCoupon && activeCouponCode) {
      toast.error("Please wait while we verify your coupon...");
      return;
    }
    if (key === "education" && loadingPrice) {
      toast.error("Please wait while we fetch the latest exam pin price...");
      return;
    }
    if (isNetworkMismatch) {
      setApiError(
        `This is not a valid ${selectedProviderName} network. Please enter a valid ${selectedProviderName} number.`
      );
      return;
    }
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    const pinExists = await checkUserHasPin();
    if (pinExists === false) {
      setPinSetupPromptOpen(true);
      return;
    }
    if (!attemptReferenceRef.current) {
      attemptReferenceRef.current = createAttemptReference(key);
    }
    setTransactionPin("");
    setPinError(null);
    setPinModalOpen(true);
  };

  const executePurchase = async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;

    try {
      if (!attemptReferenceRef.current) {
        attemptReferenceRef.current = createAttemptReference(key);
      }

      const payload: Record<string, unknown> = {
        service: key,
        provider_id: providerSlug,
        reference: attemptReferenceRef.current,
        pin: transactionPin,
        use_cashback: useCashback && cashbackAvailable,
      };
      if (activeCouponCode) {
        payload.coupon_code = activeCouponCode;
        if (selectedCoupon) {
          payload.coupon_id = selectedCoupon;
        }
      }
      if (cfg.showPlans) {
        payload.plan_id = String(planId);
        payload.plan_type = selectedCategory;
        payload.amount = Math.floor(Number(plans.find((p) => String(p.plan_id) === String(planId))?.price ?? 0));
      }
      if (cfg.showAmount && key !== "data") {
        if (key === "education") payload.quantity = Math.floor(Number(amount));
        else payload.amount = Math.floor(Number(amount));
      }
      if (key === "airtime" || key === "data") {
        const phoneResult = validatePhoneNumber(recipient);
        if (!phoneResult.valid) {
          toast.error(phoneResult.error);
          setLoading(false);
          closePinModal();
          return;
        }
        payload.recipient = phoneResult.cleaned || recipient.replace(/\D/g, "");
      } else if (key === "tv") {
        payload.smartcard = recipient.replace(/\D/g, "");
      } else if (key === "electricity") {
        payload.meter_number = recipient.replace(/\D/g, "");
        payload.meter_type = meterType === "prepaid" ? 1 : 2;
      } else if (key === "bet") {
        payload.customer_id = recipient.trim();
      }

      const resData = await callEdgeFunction<any>("purchase", payload);

      if (resData?.success) {
        attemptReferenceRef.current = null;
        setSelectedCoupon("");
        setCouponCode("");
        setCustomCouponInput("");
        closePinModal();
        const isProcessing = resData.status === "processing" || resData.status === "pending";
        if (isProcessing) {
          toast.success("Order received. Your exam pins will appear in Transactions shortly.");
          queryClient.invalidateQueries({ queryKey: ["wallet", user?.id] });
          queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
          queryClient.invalidateQueries({ queryKey: ["recent-purchase-recipients", user?.id, key] });
          queryClient.invalidateQueries({ queryKey: ["profile-welcome", user?.id] });
          queryClient.invalidateQueries({ queryKey: ["available-coupons", user?.id, key] });
          queryClient.invalidateQueries({ queryKey: ["coupon-preview", user?.id] });
          navigate({ to: "/transactions" });
          return;
        }

        const chargedAmount =
          resData.final_amount != null && resData.cashback_used != null
            ? Math.max(0, Number(resData.final_amount) - Number(resData.cashback_used))
            : walletChargePreview;
        setSuccessAmount(chargedAmount);
        setShowSuccess(true);

        queryClient.invalidateQueries({ queryKey: ["wallet", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["transactions", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["recent-purchase-recipients", user?.id, key] });
        queryClient.invalidateQueries({ queryKey: ["profile-welcome", user?.id] });
        queryClient.invalidateQueries({ queryKey: ["available-coupons", user?.id, key] });
        queryClient.invalidateQueries({ queryKey: ["coupon-preview", user?.id] });
      } else {
        const rawBackendError = resData?.error || resData?.message || "Transaction failed";
        const cleanMsg = getCleanErrorMessage(rawBackendError);
        if (cleanMsg.toLowerCase().includes("set up your pin") || cleanMsg.toLowerCase().includes("no pin")) {
          closePinModal();
          setHasPin(false);
          setPinSetupPromptOpen(true);
          return;
        }
        if (cleanMsg.toLowerCase().includes("pin")) {
          setTransactionPin("");
          setPinError(cleanMsg);
          return;
        }
        closePinModal();
        setApiError(cleanMsg);
      }
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const confirmPurchase = async () => {
    if (submitInFlightRef.current || loading) return;
    if (isNetworkMismatch) {
      closePinModal();
      setApiError(`This is not a valid ${selectedProviderName} network. Transaction aborted to prevent loss.`);
      return;
    }
    if (transactionPin.length !== 6) {
      setPinError("PIN must be exactly 6 digits");
      return;
    }

    setLoading(true);
    setPinError(null);
    try {
      await executePurchase();
    } catch (err: any) {
      const cleanMsg = getCleanErrorMessage(err);
      if (cleanMsg.toLowerCase().includes("set up your pin") || cleanMsg.toLowerCase().includes("no pin")) {
        closePinModal();
        setHasPin(false);
        setPinSetupPromptOpen(true);
      } else if (cleanMsg.toLowerCase().includes("pin")) {
        setTransactionPin("");
        setPinError(cleanMsg);
      } else {
        closePinModal();
        setApiError(cleanMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const renderRecentRecipientsBar = () => {
    if (key === "education" || recentRecipients.length === 0) return null;

    return (
      <div className="mt-2.5 space-y-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <History className="h-3 w-3 text-primary" />
          Recent {cfg.recipientLabel.toLowerCase()}s
        </span>
        <div className="flex flex-wrap gap-2">
          {recentRecipients.map((item) => {
            const isSelected =
              normalizeRecipientKey(recipient) === normalizeRecipientKey(item.recipient);

            return (
              <button
                key={normalizeRecipientKey(item.recipient)}
                type="button"
                onClick={() => void handleSelectRecentRecipient(item)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left transition ${
                  isSelected
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-secondary/70 text-foreground hover:border-primary/50 hover:bg-secondary"
                }`}
              >
                <span className="font-mono text-xs font-bold">{item.recipient}</span>
                {item.providerSlug && (
                  <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {item.providerSlug}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (!cfg) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader title="Unknown service" backTo="/dashboard" />
      </div>
    );
  }

  const maxAmount = MAX_AMOUNTS[key];
  const selectedPlan = plans.find((p) => String(p.plan_id) === planId);
  const isPlanBasedService = key === "data" || key === "tv";

  return (
    <div className="mx-auto max-w-2xl pb-24">
      <PageHeader eyebrow="Buy" title={cfg.label} subtitle={cfg.blurb} />

      <form onSubmit={submitPurchase} className="space-y-6">
        <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-5">
          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {key === "airtime" ? (
            <section className="space-y-5">
              <div>
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setAirtimeNetworkMenuOpen((open) => !open)}
                      aria-label="Choose mobile network"
                      aria-expanded={airtimeNetworkMenuOpen}
                      className="flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition hover:bg-secondary"
                    >
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-full text-[10px] font-black shadow-sm ${
                          providerSlug.toLowerCase().includes("mtn")
                            ? "bg-yellow-400 text-black"
                            : providerSlug.toLowerCase().includes("airtel")
                            ? "bg-red-600 text-white"
                            : providerSlug.toLowerCase().includes("glo")
                            ? "bg-green-600 text-white"
                            : providerSlug.toLowerCase().includes("9mobile") || providerSlug.toLowerCase().includes("t2")
                            ? "bg-emerald-700 text-white"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {providerSlug ? selectedProviderName.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase() : "NET"}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground">
                        {providerSlug ? selectedProviderName : "Network"}
                        <ChevronDown className="h-3 w-3" />
                      </span>
                    </button>

                    {airtimeNetworkMenuOpen && (
                      <div className="absolute left-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-2xl">
                        <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Select network
                        </p>
                        {providers.map((provider) => {
                          const slug = provider.slug.toLowerCase();
                          const selected = providerUuid === provider.id;
                          const badge = slug.includes("mtn")
                            ? "bg-yellow-400 text-black"
                            : slug.includes("airtel")
                            ? "bg-red-600 text-white"
                            : slug.includes("glo")
                            ? "bg-green-600 text-white"
                            : slug.includes("9mobile") || slug.includes("t2")
                            ? "bg-emerald-700 text-white"
                            : "bg-primary/15 text-primary";
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => {
                                void onProviderChange(provider.id);
                                setAirtimeNetworkMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-secondary"
                            >
                              <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${badge}`}
                              >
                                {provider.name.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase()}
                              </span>
                              <span className="flex-1 text-xs font-semibold text-foreground">{provider.name}</span>
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                  selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                                }`}
                              >
                                {selected && <Check className="h-2.5 w-2.5" />}
                              </span>
                            </button>
                          );
                        })}
                        {providers.length === 0 && (
                          <p className="px-2 py-3 text-xs text-muted-foreground">
                            {loadingProviders ? "Loading networks…" : "No networks available."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="h-10 w-px shrink-0 bg-border" />

                  <input
                    required
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={14}
                    value={recipient}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent py-3 text-base font-semibold tracking-wide text-foreground outline-none placeholder:text-muted-foreground/70"
                    placeholder="Phone number"
                    aria-label="Phone number"
                  />
                </div>

                {renderRecentRecipientsBar()}
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="text-muted-foreground">
                  {detectedSlug ? `Detected network: ${detectNetworkName(recipient)}` : "Your network is detected automatically"}
                </span>
              </div>

              {detectedSlug &&
                (isNetworkMismatch ? (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                    This number belongs to {detectNetworkName(recipient)}, not {selectedProviderName}. Please select the
                    detected network.
                  </div>
                ) : (
                  <div className="rounded-lg border border-success/20 bg-success/10 p-2.5 text-xs font-medium text-success">
                    Network verified: {detectNetworkName(recipient)}
                  </div>
                ))}

              <div className="pt-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Top up</h3>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Choose an amount or enter your own.</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {AIRTIME_QUICK_AMOUNTS.map((value) => {
                    const selected = Number(amount) === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAmount(String(value))}
                        aria-pressed={selected}
                        className={`relative flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-1 py-2 text-center transition ${
                          selected
                            ? "border-primary bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.18)]"
                            : "border-border bg-secondary/70 hover:border-primary/50 hover:bg-secondary"
                        }`}
                      >
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2 w-2" />
                          </span>
                        )}
                        <span className="text-sm font-extrabold tracking-tight text-foreground">
                          ₦{value.toLocaleString("en-NG")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Other amount</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    ₦
                  </span>
                  <input
                    required
                    type="number"
                    inputMode="numeric"
                    min={cfg.minAmount}
                    max={maxAmount}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl border border-border bg-secondary py-3 pl-8 pr-3 text-sm text-foreground outline-none transition focus:border-primary"
                    placeholder="50–50,000"
                  />
                </div>
              </div>
            </section>
          ) : isPlanBasedService ? (
            <div className="space-y-5">
              {step === 1 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">Provider</label>
                    <button
                      type="button"
                      onClick={() => setShowProviderModal(true)}
                      className="w-full flex items-center justify-between p-3 bg-secondary border border-border rounded-xl text-foreground transition hover:border-primary/50"
                      disabled={loadingProviders}
                    >
                      <span className={providerUuid ? "font-medium" : "text-muted-foreground"}>
                        {providers.find((p) => p.id === providerUuid)?.name ||
                          (loadingProviders ? "Loading providers..." : "Select provider")}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>

                  {key === "data" && planCategories.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">Plan type</label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => onCategoryChange(e.target.value)}
                        className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground"
                      >
                        {planCategories.map((c) => (
                          <option key={c.plan_type} value={c.plan_type}>
                            {c.plan_type}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-4 pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <label className="block text-base font-semibold text-foreground">Choose a plan</label>
                        <p className="mt-0.5 text-xs text-muted-foreground">Compare validity and price.</p>
                      </div>
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                        {plans.length} plans
                      </span>
                    </div>

                    {loadingPlans ? (
                      <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map((item) => (
                          <div key={item} className="h-32 animate-pulse rounded-2xl border border-border bg-secondary/70" />
                        ))}
                      </div>
                    ) : plans.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-secondary/40 px-4 py-8 text-center">
                        <p className="font-semibold text-foreground">No plans available</p>
                        <p className="mt-1 text-sm text-muted-foreground">Try selecting another provider or plan type.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {plans.map((p) => {
                          const id = String(p.plan_id);
                          const price = Math.floor(Number(p.price));
                          const durationText = formatPlanDuration(p.duration, key);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                setPlanId(id);
                                setStep(2);
                              }}
                              className="group relative flex min-h-[138px] flex-col items-center justify-center rounded-2xl border border-border bg-secondary/60 p-3 text-center transition-all duration-150 hover:border-primary/50 hover:bg-secondary"
                            >
                              <span className="line-clamp-2 pr-2 text-sm font-bold leading-snug text-foreground">
                                {p.name}
                              </span>
                              {durationText && (
                                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" />
                                  {durationText}
                                </span>
                              )}
                              <span className="mt-2 text-lg font-extrabold tracking-tight text-foreground">
                                ₦{price.toLocaleString("en-NG")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline mb-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Change plan
                  </button>

                  {selectedPlan && (
                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">Selected Plan</p>
                        <p className="text-lg font-extrabold text-foreground">{selectedPlan.name}</p>
                        <p className="text-sm font-medium text-muted-foreground">
                          {formatPlanDuration(selectedPlan.duration, key) || "Standard"} · {selectedProviderName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-foreground">₦{selectedPlan.price.toLocaleString()}</p>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                      {cfg.recipientLabel}
                    </label>
                    {key === "data" ? (
                      <input
                        required
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        maxLength={14}
                        value={recipient}
                        onChange={(e) => handleRecipientChange(e.target.value)}
                        className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground"
                        placeholder={`Enter ${cfg.recipientLabel.toLowerCase()}`}
                        aria-label={cfg.recipientLabel}
                      />
                    ) : (
                      <input
                        required
                        type="text"
                        inputMode="numeric"
                        value={recipient}
                        onChange={(e) => handleRecipientChange(e.target.value)}
                        className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground"
                        placeholder={`Enter ${cfg.recipientLabel.toLowerCase()}`}
                        aria-label={cfg.recipientLabel}
                      />
                    )}
                    {renderRecentRecipientsBar()}
                    {key === "data" &&
                      detectedSlug &&
                      (isNetworkMismatch ? (
                        <div className="mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/20">
                          <ShieldAlert className="h-4 w-4 shrink-0" />
                          <span>
                            This is not a valid {selectedProviderName} network. This is a {detectNetworkName(recipient)}{" "}
                            number.
                          </span>
                        </div>
                      ) : (
                        <div className="mt-2 p-2 rounded-lg text-xs font-medium flex items-center gap-2 bg-success/10 text-success border border-success/20">
                          <CheckCircle className="h-4 w-4 shrink-0" />
                          <span>Network verified: This is a {detectNetworkName(recipient)} number.</span>
                        </div>
                      ))}
                  </div>

                  {cfg.requiresVerification && (
                    <div>
                      <button
                        type="button"
                        onClick={verifyCustomer}
                        disabled={verifying || !recipient || !providerSlug || isVerified}
                        className={`w-full p-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                          isVerified
                            ? "bg-success/20 text-success border border-success/30"
                            : "bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
                        }`}
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                          </>
                        ) : isVerified ? (
                          <>
                            <CheckCircle className="h-4 w-4" /> Account Verified
                          </>
                        ) : (
                          "Verify Account"
                        )}
                      </button>
                      {verificationResult && (
                        <div
                          className={`mt-2 p-3 rounded-lg text-sm flex items-start gap-2 ${
                            verificationResult.verified
                              ? "bg-success/10 text-success border border-success/20"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {verificationResult.verified ? (
                            <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          ) : (
                            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                          )}
                          <span>
                            {verificationResult.verified
                              ? `Verified: ${verificationResult.customerName}`
                              : verificationResult.error}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">Provider</label>
                <button
                  type="button"
                  onClick={() => setShowProviderModal(true)}
                  className="w-full flex items-center justify-between p-3 bg-secondary border border-border rounded-xl text-foreground transition hover:border-primary/50"
                  disabled={loadingProviders}
                >
                  <span className={providerUuid ? "font-medium" : "text-muted-foreground"}>
                    {providers.find((p) => p.id === providerUuid)?.name ||
                      (loadingProviders ? "Loading providers..." : "Select provider")}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {key === "electricity" && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">Meter type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["prepaid", "postpaid"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMeterType(m)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition ${
                          meterType === m
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background/40 text-muted-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cfg.showAmount && (
                <div className="space-y-4">
                  {key === "electricity" && (
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-3">Select Amount</label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {ELECTRICITY_QUICK_AMOUNTS.map((val) => {
                          const isSelected = Number(amount) === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setAmount(String(val))}
                              className={`flex flex-col items-center justify-center rounded-xl border p-3 transition ${
                                isSelected ? "border-primary bg-primary/10" : "border-border bg-secondary/50 hover:border-primary/50"
                              }`}
                            >
                              <span className="text-base font-bold text-foreground">₦{val.toLocaleString()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                      {key === "education" ? "Quantity" : key === "electricity" ? "Other amount" : "Amount (₦)"}
                    </label>
                    <div className="relative">
                      {key !== "education" && (
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                          ₦
                        </span>
                      )}
                      <input
                        required
                        type="number"
                        inputMode="numeric"
                        min={cfg.minAmount}
                        max={maxAmount > 0 ? maxAmount : undefined}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className={`w-full p-3 bg-secondary border border-border rounded-xl text-foreground ${
                          key !== "education" ? "pl-8" : ""
                        }`}
                        placeholder={
                          key === "education"
                            ? "e.g. 2"
                            : key === "bet"
                            ? "100–100,000"
                            : "e.g. 1000"
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {key !== "education" && (
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    {cfg.recipientLabel}
                  </label>
                  {key === "electricity" || key === "bet" ? (
                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      value={recipient}
                      onChange={(e) => handleRecipientChange(e.target.value)}
                      className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground"
                      placeholder={`Enter ${cfg.recipientLabel.toLowerCase()}`}
                      aria-label={cfg.recipientLabel}
                    />
                  ) : (
                    <input
                      required
                      type="text"
                      value={recipient}
                      onChange={(e) => handleRecipientChange(e.target.value)}
                      className="w-full p-3 bg-secondary border border-border rounded-xl text-foreground"
                      placeholder={`Enter ${cfg.recipientLabel.toLowerCase()}`}
                      aria-label={cfg.recipientLabel}
                    />
                  )}
                  {renderRecentRecipientsBar()}
                </div>
              )}

              {cfg.requiresVerification && (
                <div>
                  <button
                    type="button"
                    onClick={verifyCustomer}
                    disabled={verifying || !recipient || !providerSlug || isVerified}
                    className={`w-full p-3 rounded-xl font-semibold transition flex items-center justify-center gap-2 ${
                      isVerified
                        ? "bg-success/20 text-success border border-success/30"
                        : "bg-secondary border border-border text-foreground hover:bg-secondary/80 disabled:opacity-50"
                    }`}
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifying...
                      </>
                    ) : isVerified ? (
                      <>
                        <CheckCircle className="h-4 w-4" /> Account Verified
                      </>
                    ) : (
                      "Verify Account"
                    )}
                  </button>
                  {verificationResult && (
                    <div
                      className={`mt-2 p-3 rounded-lg text-sm flex items-start gap-2 ${
                        verificationResult.verified
                          ? "bg-success/10 text-success border border-success/20"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {verificationResult.verified ? (
                        <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      )}
                      <span>
                        {verificationResult.verified
                          ? `Verified: ${verificationResult.customerName}`
                          : verificationResult.error}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {welcomeDiscountAvailable && (
                <div className="rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 p-4 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20 shrink-0">
                    <Gift className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-700 dark:text-green-400">Welcome bonus!</p>
                    <p className="text-xs text-green-700/80 dark:text-green-400/80 mt-0.5">
                      Get 1% off your first purchase of ₦500 or more, up to ₦20.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!((key === "data" || key === "tv") && step === 1) && (
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5 space-y-4">
            <h3 className="font-bold text-foreground">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>₦{subtotal.toLocaleString()}</span>
              </div>
              {welcomeDiscount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Welcome Discount</span>
                  <span>-₦{welcomeDiscount.toLocaleString()}</span>
                </div>
              )}
              {displayTotal > 0 && (
                <div className="pt-2 pb-1 space-y-2">
                  {availableCoupons &&
                    availableCoupons.filter((c) => !c.coupons?.min_purchase || displayTotal >= c.coupons.min_purchase)
                      .length > 0 && (
                      <select
                        value={selectedCoupon}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedCoupon(id);
                          const found = availableCoupons.find((c) => c.id === id);
                          const code = found?.coupons?.code || "";
                          setCouponCode(code);
                          if (code) setCustomCouponInput("");
                        }}
                        className="w-full p-2 text-xs bg-secondary border border-border rounded-lg text-foreground"
                      >
                        <option value="">Choose an assigned coupon...</option>
                        {availableCoupons
                          .filter((c) => !c.coupons?.min_purchase || displayTotal >= c.coupons.min_purchase)
                          .map((c) => {
                            const scope = (c.coupons?.service_target || "all").toLowerCase();
                            const scopeLabel = scope === "all" ? "All purchases" : `${scope} only`;
                            return (
                              <option key={c.id} value={c.id}>
                                {c.coupons?.code} (
                                {c.coupons?.discount_type === "percentage"
                                  ? `${c.coupons.discount_value}%`
                                  : `₦${Number(c.coupons?.discount_value || 0).toLocaleString()}`}{" "}
                                off · {scopeLabel})
                              </option>
                            );
                          })}
                      </select>
                    )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customCouponInput}
                      onChange={(e) => {
                        setCustomCouponInput(e.target.value.toUpperCase());
                        if (e.target.value.trim()) {
                          setSelectedCoupon("");
                          setCouponCode("");
                        }
                      }}
                      placeholder="Or enter promo/coupon code"
                      className="flex-1 p-2 text-xs uppercase bg-secondary border border-border rounded-lg text-foreground placeholder:normal-case"
                    />
                    {activeCouponCode && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCoupon("");
                          setCouponCode("");
                          setCustomCouponInput("");
                        }}
                        className="px-2.5 py-2 text-xs font-semibold rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Coupons apply to eligible purchases only and cannot be used for transfers.
                  </p>

                  {previewingCoupon && activeCouponCode && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Checking coupon...
                    </p>
                  )}

                  {couponPreviewError && activeCouponCode && !previewingCoupon && (
                    <p className="text-[11px] text-destructive">{getCleanErrorMessage(couponPreviewError)}</p>
                  )}
                </div>
              )}
              {couponDiscountPreview > 0 && (
                <div className="flex justify-between text-success">
                  <span className="flex items-center gap-1">
                    <Ticket className="h-3 w-3" /> Coupon ({activeCouponCode})
                  </span>
                  <span>-₦{couponDiscountPreview.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-foreground pt-2 border-t border-border">
                <span>Total</span>
                <span>₦{amountAfterCoupon.toLocaleString()}</span>
              </div>
            </div>

            {cashbackAvailable && (
              <div className="pt-2 border-t border-border">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCashback}
                    onChange={(e) => setUseCashback(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm text-foreground">Use Cashback (₦{cashbackBalance.toLocaleString()})</span>
                </label>
              </div>
            )}

            <div className="pt-2 border-t border-border space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-foreground">Wallet Balance</span>
                <span className="text-foreground">₦{walletBalance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount to pay</span>
                <span className={isInsufficient ? "text-destructive font-bold" : "text-foreground"}>
                  ₦{walletChargePreview.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {!((key === "data" || key === "tv") && step === 1) && (
          <div className="space-y-3">
            <button
              type="submit"
              disabled={
                loading ||
                checkingPinStatus ||
                loadingPriceData ||
                (previewingCoupon && !!activeCouponCode) ||
                isInsufficient ||
                (key === "education" && loadingPrice)
              }
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-3 rounded-xl font-semibold shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ||
              checkingPinStatus ||
              loadingPriceData ||
              (previewingCoupon && !!activeCouponCode) ||
              (key === "education" && loadingPrice) ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Processing...
                </>
              ) : isInsufficient ? (
                "Insufficient Balance"
              ) : (
                "Make Purchase"
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-primary/70" />
              <span>Payments and transactions securely encrypted & processed via Pairgate</span>
            </div>
          </div>
        )}
      </form>

      {/* --- SET UP YOUR PIN FIRST PROMPT --- */}
      {pinSetupPromptOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Set up transaction PIN"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-2xl">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <KeyRound className="h-6 w-6" />
            </div>
            <h3 className="text-center text-lg font-bold text-foreground">Set up your PIN first</h3>
            <p className="mt-1.5 text-center text-sm text-muted-foreground">
              You need a 6-digit transaction PIN before completing a {cfg.label.toLowerCase()} purchase.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setPinSetupPromptOpen(false)}
                className="flex-1 rounded-xl bg-secondary py-3 text-sm font-semibold text-foreground hover:bg-secondary/80 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinSetupPromptOpen(false);
                  navigate({ to: "/security", search: { setupPin: "1" } });
                }}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md hover:opacity-95 transition"
              >
                Setup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TRANSACTION PIN MODAL --- */}
      {pinModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Enter transaction PIN"
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => !loading && closePinModal()}
        >
          <div
            className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center border-b border-border/50">
              <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                <ShieldAlert className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-foreground">Enter Transaction PIN</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Confirm payment of{" "}
                <span className="font-bold text-foreground">₦{walletChargePreview.toLocaleString()}</span> for{" "}
                {cfg.label}.
              </p>
            </div>

            <div className="p-6">
              <div>
                <div
                  className="relative flex justify-center gap-2 sm:gap-3 cursor-text"
                  onClick={() => pinInputRef.current?.focus()}
                >
                  <input
                    ref={pinInputRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={transactionPin}
                    onChange={(e) => {
                      setPinError(null);
                      setTransactionPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                    }}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    autoFocus
                    aria-label="Transaction PIN"
                    autoComplete="one-time-code"
                    name="vevu_secure_txn_pin"
                  />
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-10 h-12 sm:w-12 sm:h-14 flex items-center justify-center text-xl font-bold rounded-xl border-2 transition-all duration-200 ${
                        transactionPin.length === i
                          ? "border-primary bg-primary/5 shadow-[0_0_0_4px_hsl(var(--primary)/0.1)]"
                          : transactionPin.length > i
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-border bg-secondary text-foreground"
                      }`}
                    >
                      {transactionPin.length > i ? "•" : ""}
                    </div>
                  ))}
                </div>
                {pinError && (
                  <div role="alert" className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center flex items-center justify-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {pinError}
                  </div>
                )}
                <div className="mt-8 flex gap-3">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={closePinModal}
                    className="flex-1 py-3 rounded-xl bg-secondary text-foreground font-semibold hover:bg-secondary/80 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmPurchase}
                    disabled={loading || transactionPin.length !== 6}
                    className="flex-[2] py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md disabled:opacity-50 flex items-center justify-center gap-2 transition"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm Payment"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <SuccessScreen
        isOpen={showSuccess}
        amount={successAmount}
        onClose={() => {
          setShowSuccess(false);
          navigate({ to: "/transactions" });
        }}
      />

      <ErrorPopup isOpen={!!apiError} message={apiError} onClose={() => setApiError(null)} />

      {showProviderModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Select provider"
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowProviderModal(false)}
        >
          <div
            className="w-full max-w-sm bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[85vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border flex justify-between items-center sticky top-0 bg-card z-10 rounded-t-3xl">
              <h3 className="text-lg font-bold text-foreground">Select Provider</h3>
              <button
                type="button"
                onClick={() => setShowProviderModal(false)}
                aria-label="Close provider picker"
                className="p-1.5 rounded-full hover:bg-secondary"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-2 overflow-y-auto">
              {providers.map((p) => {
                const isSelected = providerUuid === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      void onProviderChange(p.id);
                      setShowProviderModal(false);
                    }}
                    className={`flex w-full items-center justify-between p-3 rounded-xl transition ${
                      isSelected ? "bg-primary/10" : "hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                        }`}
                      >
                        {p.name.replace(/[^a-z0-9]/gi, "").slice(0, 3).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{p.name}</span>
                    </div>
                    {isSelected ? (
                      <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />
                    )}
                  </button>
                );
              })}
              {providers.length === 0 && (
                <p className="p-4 text-center text-muted-foreground">
                  {loadingProviders ? "Loading..." : "No providers found"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
