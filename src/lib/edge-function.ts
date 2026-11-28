import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/config/env";
import { getValidAccessToken, supabase } from "@/lib/supabase";

export interface EdgeFunctionResult<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: any;
}

async function extractErrorResponse(error: any) {
  let responseBody: any = null;

  try {
    const context = error?.context;

    if (context) {
      if (typeof context.clone === "function") {
        responseBody = await context.clone().json();
      } else if (typeof context.json === "function") {
        responseBody = await context.json();
      }
    }
  } catch {
    try {
      const context = error?.context;

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
    error?.message ||
    "An unexpected server error occurred.";

  return {
    success: false,
    message,
    error: message,
    status: error?.context?.status || null,
    details: responseBody,
  };
}

export async function callEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, any>
): Promise<EdgeFunctionResult<T>> {
  try {
    const accessToken = await getValidAccessToken();
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (error) {
      return await extractErrorResponse(error);
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
  } catch (error: any) {
    const message =
      error?.message || "Unable to connect to the server.";

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
