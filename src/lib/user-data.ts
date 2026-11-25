// src/lib/user-data.ts
import { supabase } from "@/lib/supabase";

export interface WalletBalance {
  balance: number;
  cashback_balance: number;
}

interface CouponDetails {
  id: string;
  code?: string | null;
  description?: string | null;
  discount_type?: string | null;
  discount_value?: number | string | null;
  min_purchase?: number | string | null;
  max_discount?: number | string | null;
  is_active?: boolean | null;
  valid_until?: string | null;
  service_target?: string | null;
}

interface UserCouponRow {
  id: string;
  coupon_id?: string | null;
  is_used?: boolean | null;
  used_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
}

export interface UserCoupon {
  id: string;
  user_coupon_id: string;
  coupon_id: string | null;
  code: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  max_discount: number;
  expires_at: string | null;
  is_used: boolean;
  used_at: string | null;
  is_active: boolean;
  assigned_at: string | null;
  service_target: string;
}

const toNumber = (value: number | string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const resolveEarliestExpiry = (
  userCouponExpiresAt?: string | null,
  couponValidUntil?: string | null
): string | null => {
  const candidates = [userCouponExpiresAt, couponValidUntil].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0 && !Number.isNaN(new Date(v).getTime())
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  return new Date(candidates[0]).getTime() <= new Date(candidates[1]).getTime()
    ? candidates[0]
    : candidates[1];
};

const normalizeServiceTarget = (target?: string | null): string => {
  const cleaned = (target ?? "").trim().toLowerCase();
  return cleaned || "all";
};

export async function fetchWalletBalance(userId: string): Promise<WalletBalance> {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance, cashback_balance")
    .eq("profile_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  return {
    balance: toNumber(data?.balance),
    cashback_balance: toNumber(data?.cashback_balance),
  };
}

export async function fetchUserCoupons(userId: string): Promise<UserCoupon[]> {
  // 1. Fetch user's coupon assignments
  const { data: rows, error: rowsErr } = await supabase
    .from("user_coupons")
    .select("id, coupon_id, is_used, used_at, expires_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (rowsErr) throw rowsErr;
  const userCoupons = (rows ?? []) as UserCouponRow[];
  if (userCoupons.length === 0) return [];

  // 2. Fetch coupon details directly by id
  const couponIds = Array.from(
    new Set(userCoupons.map((r) => r.coupon_id).filter((v): v is string => !!v))
  );

  const couponMap = new Map<string, CouponDetails>();
  if (couponIds.length > 0) {
    const { data: coupons, error: cErr } = await supabase
      .from("coupons")
      .select(
        "id, code, description, discount_type, discount_value, min_purchase, max_discount, is_active, valid_until, service_target"
      )
      .in("id", couponIds);

    if (cErr) {
      console.warn("Could not load coupon details:", cErr);
    } else if (coupons) {
      for (const c of coupons as CouponDetails[]) couponMap.set(c.id, c);
    }
  }

  return userCoupons.map((row) => {
    const coupon = row.coupon_id ? couponMap.get(row.coupon_id) ?? null : null;
    const expiresAt = resolveEarliestExpiry(row.expires_at, coupon?.valid_until);
    const discountType = (coupon?.discount_type ?? "percentage").trim().toLowerCase();

    return {
      id: coupon?.id ?? row.coupon_id ?? row.id,
      user_coupon_id: row.id,
      coupon_id: row.coupon_id ?? coupon?.id ?? null,
      code: coupon?.code ?? "Coupon details unavailable",
      description: coupon?.description ?? "Discount coupon",
      discount_type: discountType,
      discount_value: toNumber(coupon?.discount_value),
      min_purchase: toNumber(coupon?.min_purchase),
      max_discount: toNumber(coupon?.max_discount),
      expires_at: expiresAt,
      is_used: Boolean(row.is_used),
      used_at: row.used_at ?? null,
      is_active: coupon?.is_active ?? true,
      assigned_at: row.created_at ?? null,
      service_target: normalizeServiceTarget(coupon?.service_target),
    };
  });
}

export function isActiveCoupon(
  coupon: Pick<UserCoupon, "is_used" | "expires_at" | "is_active">,
  nowMs: number = Date.now()
): boolean {
  const expiryMs = coupon.expires_at ? new Date(coupon.expires_at).getTime() : NaN;
  const isExpired = Number.isFinite(expiryMs) && expiryMs <= nowMs;
  return Boolean(coupon.is_active) && !Boolean(coupon.is_used) && !isExpired;
}
