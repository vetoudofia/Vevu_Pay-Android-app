import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/env";

export interface EdgeFunctionResult<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

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

export async function callEdgeFunction<T = any>(
  name: string,
  body: Record<string, any>
): Promise<EdgeFunctionResult<T>> {
  try {
    const accessToken = await getValidAccessToken();
    const { data, error } = await supabase.functions.invoke(name, {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (error) {
      let responseBody: any = null;
      try {
        const context = (error as any)?.context;
        if (context && typeof context.clone === "function") {
          responseBody = await context.clone().json();
        } else if (context && typeof context.json === "function") {
          responseBody = await context.json();
        }
      } catch {
        try {
          const context = (error as any)?.context;
          if (context && typeof context.clone === "function") {
            responseBody = await context.clone().text();
          }
        } catch {
          responseBody = null;
        }
      }

      if (typeof responseBody === "string") {
        try {
          responseBody = JSON.parse(responseBody);
        } catch {
          responseBody = { message: responseBody };
        }
      }

      const message =
        responseBody?.message ||
        responseBody?.error ||
        error.message ||
        "An unexpected server error occurred.";

      return {
        success: false,
        message,
        error: message,
        status: (error as any)?.context?.status || null,
        details: responseBody,
      };
    }

    if (data?.success === false) {
      const message =
        data.message ||
        data.error ||
        "The requested operation failed.";

      return {
        success: false,
        message,
        error: message,
        details: data,
      };
    }

    return {
      success: true,
      ...data,
    };
  } catch (err: any) {
    const message =
      err?.message === "Failed to fetch" || err?.name === "TypeError"
        ? "Network Error: Please check your internet connection."
        : err?.message || "Unable to connect to the server.";

    return {
      success: false,
      message,
      error: message,
    };
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
