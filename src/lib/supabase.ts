import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/env";

const memoryStorage = new Map<string, string>();

function getAvailableStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  for (const candidate of [window.localStorage, window.sessionStorage]) {
    if (!candidate) continue;
    try {
      const probeKey = "__vevupay_storage_probe__";
      candidate.setItem(probeKey, "1");
      candidate.removeItem(probeKey);
      return candidate;
    } catch {
      // Try next storage mechanism
    }
  }
  return null;
}

function createPersistentStorage(): SupportedStorage {
  return {
    getItem: (key: string): string | null => {
      const storage = getAvailableStorage();
      if (storage) {
        try {
          return storage.getItem(key);
        } catch {
          return memoryStorage.get(key) ?? null;
        }
      }
      return memoryStorage.get(key) ?? null;
    },
    setItem: (key: string, value: string): void => {
      const storage = getAvailableStorage();
      if (storage) {
        try {
          storage.setItem(key, value);
          return;
        } catch {
          memoryStorage.set(key, value);
          return;
        }
      }
      memoryStorage.set(key, value);
    },
    removeItem: (key: string): void => {
      for (const storage of [window?.localStorage, window?.sessionStorage]) {
        if (!storage) continue;
        try {
          storage.removeItem(key);
        } catch {
          // ignore
        }
      }
      memoryStorage.delete(key);
    },
  };
}

export function clearSupabaseClientStorage(options?: {
  includeAccountKeys?: boolean;
}): void {
  const includeAccountKeys = Boolean(options?.includeAccountKeys);

  for (const key of Array.from(memoryStorage.keys())) {
    if (
      key.startsWith("sb-") ||
      key.includes("supabase") ||
      (includeAccountKeys && (key.startsWith("vevupay_") || key === "device_id"))
    ) {
      memoryStorage.delete(key);
    }
  }

  if (typeof window === "undefined") return;

  for (const storage of [window.sessionStorage, window.localStorage]) {
    if (!storage) continue;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (!k) continue;
        const isSupabaseKey = k.startsWith("sb-") || k.includes("supabase");
        const isAccountKey =
          includeAccountKeys && (k.startsWith("vevupay_") || k === "device_id");
        if (isSupabaseKey || isAccountKey) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore storage access errors in restricted browser contexts
    }
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storage: createPersistentStorage(),
  },
});

export async function getValidAccessToken(): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (!error && session?.access_token) {
    const expiresAt = session.expires_at ?? 0;
    if (expiresAt > nowSeconds + 60) {
      return session.access_token;
    }
  }

  const { data: refreshed, error: refreshError } =
    await supabase.auth.refreshSession();

  if (!refreshError && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  if (session?.access_token) {
    return session.access_token;
  }

  throw new Error("Your session is invalid or expired. Please sign in again.");
}
