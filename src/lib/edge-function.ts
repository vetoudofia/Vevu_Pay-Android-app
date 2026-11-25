import { supabase } from "@/lib/supabase";

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
    const { data, error } = await supabase.functions.invoke(
      functionName,
      { body }
    );

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

export const callPublicEdgeFunction = callEdgeFunction;
