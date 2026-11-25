import { PAYSTACK_PUBLIC_KEY } from "@/config/env";

interface PaystackHandler {
  openIframe: () => void;
}
interface PaystackSetupOptions {
  key: string;
  email: string;
  amount: number; // in kobo
  currency?: string;
  ref: string;
  metadata?: Record<string, unknown>;
  callback: (response: { reference: string; status?: string }) => void;
  onClose: () => void;
}
declare global {
  interface Window {
    PaystackPop?: { setup: (opts: PaystackSetupOptions) => PaystackHandler };
  }
}

const SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";
let scriptPromise: Promise<void> | null = null;

export function loadPaystack(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Paystack only runs in the browser"));
  if (window.PaystackPop) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Paystack failed to load")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Paystack failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface PayWithPaystackArgs {
  email: string;
  amountNaira: number;
  reference: string;
  metadata?: Record<string, unknown>;
}

/**
 * Opens the Paystack inline popup. Resolves with the transaction reference on
 * successful client-side callback, rejects if the user closes the modal.
 * The server MUST verify the reference (via your verify-payment edge fn /
 * Paystack webhook) before crediting anything.
 */
export function payWithPaystack({ email, amountNaira, reference, metadata }: PayWithPaystackArgs): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      if (!PAYSTACK_PUBLIC_KEY.trim()) {
        throw new Error(
          "Wallet funding is not configured yet. Please contact VevuPay support.",
        );
      }
      await loadPaystack();
      if (!window.PaystackPop) throw new Error("Paystack not available");
      let settled = false;
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email,
        amount: Math.round(amountNaira * 100),
        currency: "NGN",
        ref: reference,
        metadata,
        callback: (res) => {
          settled = true;
          resolve(res.reference);
        },
        onClose: () => {
          if (!settled) reject(new Error("Payment window closed"));
        },
      });
      handler.openIframe();
    } catch (err) {
      reject(err);
    }
  });
}
