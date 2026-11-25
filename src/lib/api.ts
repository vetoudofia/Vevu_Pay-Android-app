// src/lib/api.ts
import { supabase, callEdgeFunction } from "@/lib/supabase";
import { SUPABASE_URL } from "@/config/env";

// ─── Helper to extract error from invoke response ──────────────
async function extractError(error: any): Promise<string> {
  if (!error) return "Unknown error";
  if (error.context) {
    try {
      const text = await error.context.text();
      const parsed = JSON.parse(text);
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
    } catch {}
  }
  return error.message || "Unknown error";
}

// ─── FORMAT HELPERS ──────────────────────────────────────────────
export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
}

// ─── Get user by identifier ──────────────────────────────────────
export async function getUserByIdentifier(identifier: string) {
  try {
    const { data, error } = await supabase.functions.invoke("get-user-by-identifier", {
      body: { identifier },
    });
    if (error) {
      const msg = await extractError(error);
      throw new Error(msg);
    }
    return data;
  } catch (err: any) {
    throw new Error(err?.message || "User not found");
  }
}

// ─── Send transfer ──────────────────────────────────────────────
export async function sendTransfer(
  recipient: string,
  amount: number,
  description: string,
  method?: string
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to send money");

  const { data, error } = await supabase.functions.invoke("send-transfer", {
    body: {
      recipient,
      amount,
      description,
      method: method || "vevu_id",
      user_id: user.id,
    },
  });
  if (error) {
    const msg = await extractError(error);
    throw new Error(msg);
  }
  return data;
}

// ─── Generate payment code ──────────────────────────────────────
export async function generatePaymentCode(
  amount: number,
  item_name: string,
  description: string
) {
  const { data, error } = await supabase.functions.invoke("generate-payment-code", {
    body: { amount, item_name, description },
  });
  if (error) throw error;
  return data;
}

// ─── Redeem payment code ────────────────────────────────────────
export async function redeemPaymentCode(code: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to redeem a payment code");

  const { data, error } = await supabase.functions.invoke("redeem-payment-code", {
    body: {
      code,
      user_id: user.id,
    },
  });
  if (error) {
    const msg = await extractError(error);
    throw new Error(msg);
  }
  return data;
}

// ─── QR image URL ──────────────────────────────────────────────
export const getQRImageUrl = (userId?: string) => {
  const base = SUPABASE_URL;
  const path = "/functions/v1/generate-qr";
  const params = userId ? `?user_id=${userId}` : "";
  return `${base}${path}${params}`;
};

// ─── DATA PLAN API FUNCTIONS ─────────────────────────────────────

export async function getDataPlanCategories() {
  try {
    const result = await callEdgeFunction<{ data?: any[] }>("purchase", { 
      action: "get_categories" 
    });
    return result?.data || result || [];
  } catch (error) {
    console.error("❌ Failed to fetch data plan categories:", error);
    throw error;
  }
}

export async function getDataPlans(providerId: string, planType: string) {
  try {
    const result = await callEdgeFunction<{ data?: Record<string, any[]> }>("purchase", {
      action: "get_plans",
      provider_id: providerId,
      plan_type: planType,
    });
    return result?.data || result || {};
  } catch (error) {
    console.error("❌ Failed to fetch data plans:", error);
    throw error;
  }
}

// ─── E-PIN / RECHARGE CARD API FUNCTIONS ───────────────────────

export async function getEpinDenominations() {
  try {
    const result = await callEdgeFunction<{ data?: any[] }>("purchase", {
      action: "get_epin_denominations",
    });
    return result?.data || result || [];
  } catch (error) {
    console.error("❌ Failed to fetch e-Pin denominations:", error);
    throw error;
  }
}

export async function buyEpin(amount: number, quantity: number, password: string) {
  try {
    const result = await callEdgeFunction<{
      success: boolean;
      reference_code?: string;
      receipt_url?: string;
      batch_id?: string;
      pins?: string[];
      error?: string;
      message?: string;
    }>("purchase", {
      action: "buy_epin",
      amount,
      quantity,
      password,
    });
    return result;
  } catch (error) {
    console.error("❌ Failed to purchase e-Pin:", error);
    throw error;
  }
}

export async function getEpinBatch(batchId: string) {
  try {
    const result = await callEdgeFunction<{ data?: any }>("purchase", {
      action: "get_epin_batch",
      batchId,
    });
    return result?.data || result || null;
  } catch (error) {
    console.error("❌ Failed to fetch e-Pin batch:", error);
    throw error;
  }
}

// ─── WALLET API FUNCTIONS ──────────────────────────────────────

export async function getWalletBalance() {
  try {
    const result = await callEdgeFunction<{ balance?: number }>("purchase", {
      action: "get_wallet",
    });
    return result?.balance || 0;
  } catch (error) {
    console.error("❌ Failed to fetch wallet balance:", error);
    throw error;
  }
}

// ─── PURCHASE API FUNCTIONS ────────────────────────────────────

export async function purchaseService(params: {
  service: string;
  provider_id: string;
  plan_id?: string;
  amount?: number;
  recipient?: string;
  reference?: string;
  pin: string;
  quantity?: number;
  meter_type?: number;
  coupon_id?: string;
  coupon_code?: string;
}) {
  try {
    const result = await callEdgeFunction<{
      success: boolean;
      message?: string;
      reference_code?: string;
      balance_before?: number;
      balance_after?: number;
      status?: string;
      discount?: number;
      original_amount?: number;
      error?: string;
    }>("purchase", params);
    return result;
  } catch (error) {
    console.error("❌ Failed to purchase:", error);
    throw error;
  }
}

// ─── TRANSACTION API FUNCTIONS ─────────────────────────────────

export async function getTransactions(limit: number = 20, offset: number = 0) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch transactions:", error);
    throw error;
  }
}

export async function getTransactionByReference(reference: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("reference", reference)
      .eq("user_id", user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch transaction:", error);
    throw error;
  }
}

// ─── NOTIFICATION API FUNCTIONS ─────────────────────────────────

export async function getNotifications(limit: number = 20, unreadOnly: boolean = false) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (unreadOnly) {
      query = query.eq("read", false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch notifications:", error);
    throw error;
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to mark notification as read:", error);
    throw error;
  }
}

export async function markAllNotificationsRead() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to mark all notifications as read:", error);
    throw error;
  }
}

// ─── COUPON API FUNCTIONS ──────────────────────────────────────

export async function getAvailableCoupons() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("user_coupons")
      .select(`
        id,
        expires_at,
        coupons (
          code,
          discount_type,
          discount_value,
          min_purchase,
          max_discount
        )
      `)
      .eq("user_id", user.id)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString());

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("❌ Failed to fetch coupons:", error);
    throw error;
  }
}

// ─── PROFILES API FUNCTIONS ─────────────────────────────────────

export async function getUserProfile() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to fetch profile:", error);
    throw error;
  }
}

export async function updateUserProfile(updates: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("❌ Failed to update profile:", error);
    throw error;
  }
}

// ─── VERIFICATION API FUNCTIONS ─────────────────────────────────

export async function verifyCustomer(params: {
  service: string;
  provider_id: string;
  meter_number?: string;
  meter_type?: number;
  smartcard?: string;
  customer_id?: string;
}) {
  try {
    const result = await callEdgeFunction<{
      success: boolean;
      status?: boolean;
      customer_name?: string;
      data?: any;
      error?: string;
    }>("purchase", {
      action: "verify",
      ...params,
    });
    return result;
  } catch (error) {
    console.error("❌ Failed to verify customer:", error);
    throw error;
  }
}

// ─── EXPORT ALL ──────────────────────────────────────────────────

export default {
  getUserByIdentifier,
  sendTransfer,
  generatePaymentCode,
  redeemPaymentCode,
  getQRImageUrl,
  formatNaira,
  getDataPlanCategories,
  getDataPlans,
  getEpinDenominations,
  buyEpin,
  getEpinBatch,
  getWalletBalance,
  purchaseService,
  getTransactions,
  getTransactionByReference,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getAvailableCoupons,
  getUserProfile,
  updateUserProfile,
  verifyCustomer,
};
