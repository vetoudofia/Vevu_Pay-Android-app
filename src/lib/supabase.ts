// src/lib/supabase.ts
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

export async function callEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      throw new Error("Authentication required. Please log in again.");
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Something went wrong. Please try again.";

      try {
        const json = JSON.parse(errorText);
        errorMessage = json.error || json.message || errorMessage;
      } catch {
        console.error(`Edge function ${name} returned non-JSON status ${response.status}`);
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (
      data &&
      typeof data === "object" &&
      "success" in data &&
      data.success === false
    ) {
      throw new Error(data.error || "Edge function returned an error");
    }

    return data as T;
  } catch (err: any) {
    if (err?.message === "Failed to fetch" || err?.name === "TypeError") {
      throw new Error("Network Error: Please check your internet connection.");
    }
    throw err;
  }
}

export async function callPublicEdgeFunction<T = unknown>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = "Request failed. Please try again.";
    try {
      const text = await response.text();
      const json = JSON.parse(text);
      errorMessage = json.error || json.message || errorMessage;
    } catch {
      console.error(`Public edge function ${name} returned status ${response.status}`);
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}
