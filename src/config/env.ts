// src/config/env.ts

export const APP_NAME = "VevuPay";

// Keep this to handle SSR/Testing environments where import.meta might be undefined
const metaEnv: Record<string, string | undefined> =
  typeof import.meta !== "undefined" && (import.meta as any).env
    ? (import.meta as any).env
    : {};

// 🛑 Helper to fail loudly if a variable is missing
const getEnvVar = (viteKey: string, publicKey: string, name: string): string => {
  const value = metaEnv[viteKey] ?? metaEnv[publicKey];
  
  if (!value || value.trim() === "") {
    throw new Error(
      `❌ Missing Environment Variable: ${name}\n` +
      `Please set ${viteKey} in your .env file (for local dev) or your hosting provider (for production).`
    );
  }
  return value;
};

// 🛑 Strict exports (The app will crash on boot if these are missing)
export const SUPABASE_URL = getEnvVar("VITE_SUPABASE_URL", "PUBLIC_SUPABASE_URL", "Supabase URL");

export const SUPABASE_ANON_KEY = getEnvVar("VITE_SUPABASE_ANON_KEY", "PUBLIC_SUPABASE_ANON_KEY", "Supabase Anon Key");

// Paystack is only needed when a user opens the wallet-funding flow. Do not
// prevent login, transfers, purchases, or the rest of the app from booting
// merely because the public checkout key has not yet been configured.
export const PAYSTACK_PUBLIC_KEY =
  metaEnv.VITE_PAYSTACK_PUBLIC_KEY ?? metaEnv.PUBLIC_PAYSTACK_PUBLIC_KEY ?? "";

// No longer needed since the app will crash before this gets evaluated if vars are missing.
// But we keep it here so we don't break any files that are importing it.
export const isConfigured = true; 
