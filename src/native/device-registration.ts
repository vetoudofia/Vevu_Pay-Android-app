import { Capacitor } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";

const DEVICE_ID_STORAGE_KEY = "vevupay_device_id";
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.0";

let deviceRegistrationInFlight: Promise<string | null> | null = null;

function getStoredDeviceId(): string | null {
  try {
    return window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeDeviceId(deviceId: string): void {
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // The native Device identifier remains available if web storage is blocked.
  }
}

export async function getPersistentDeviceId(): Promise<string> {
  const stored = getStoredDeviceId();
  if (stored && stored.length <= 128) return stored;

  let deviceId = "";
  try {
    const result = await Device.getId();
    deviceId = result.identifier?.trim() || "";
  } catch {
    // Fall back to a random installation identifier if the native plugin fails.
  }

  if (!deviceId || deviceId.length > 128) {
    deviceId = crypto.randomUUID();
  }

  storeDeviceId(deviceId);
  return deviceId;
}

function getDeviceDisplayName(info: Awaited<ReturnType<typeof Device.getInfo>>): string {
  const parts = [info.manufacturer, info.model]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  const name = parts.length ? parts.join(" ") : "Android device";
  return name.slice(0, 100);
}

async function invokeDeviceManagement(
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("device-management", {
    body,
  });

  if (error) {
    throw new Error(error.message || "Unable to register this device.");
  }

  if (!data || data.success !== true) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "The device-management service rejected this request.",
    );
  }

  return data as Record<string, unknown>;
}

/** Registers the authenticated Android installation as an active device. */
export async function registerAndroidDevice(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  if (deviceRegistrationInFlight) return deviceRegistrationInFlight;

  deviceRegistrationInFlight = (async () => {
    const info = await Device.getInfo();
    if (info.platform !== "android") return null;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) return null;

    const deviceId = await getPersistentDeviceId();

    await invokeDeviceManagement({
      action: "register_device",
      device_id: deviceId,
      device_name: getDeviceDisplayName(info),
      platform: "android",
      app_version: APP_VERSION.slice(0, 40),
    });

    return deviceId;
  })();

  try {
    return await deviceRegistrationInFlight;
  } finally {
    deviceRegistrationInFlight = null;
  }
}

async function registerFcmTokenForDevice(deviceId: string): Promise<void> {
  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: Error) => void;
  const tokenPromise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  const registrationListener = await PushNotifications.addListener(
    "registration",
    async (token) => {
      try {
        await invokeDeviceManagement({
          action: "register_fcm_token",
          device_id: deviceId,
          fcm_token: token.value,
        });
        resolveToken(token.value);
      } catch (error) {
        rejectToken(
          error instanceof Error
            ? error
            : new Error("Unable to save the notification token."),
        );
      }
    },
  );

  const errorListener = await PushNotifications.addListener(
    "registrationError",
    (error) => {
      rejectToken(
        new Error(error?.error || "Firebase notification registration failed."),
      );
    },
  );

  const timeoutId = window.setTimeout(() => {
    rejectToken(new Error("Timed out while registering push notifications."));
  }, 20000);

  try {
    await PushNotifications.register();
    await tokenPromise;
  } finally {
    window.clearTimeout(timeoutId);
    await registrationListener.remove();
    await errorListener.remove();
  }
}

/**
 * Silently refreshes an FCM token when the user has already granted Android
 * notification permission. This keeps rotated tokens current without showing
 * another permission prompt.
 */
export async function syncAndroidPushTokenIfPermitted(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") return;

  const deviceId = await registerAndroidDevice();
  if (!deviceId) return;
  await registerFcmTokenForDevice(deviceId);
}

/**
 * Requests notification permission only when the user explicitly enables it,
 * then registers the FCM token against the already-registered Android device.
 */
export async function enableAndroidPushNotifications(): Promise<{
  enabled: boolean;
  reason?: string;
}> {
  if (!Capacitor.isNativePlatform()) {
    return { enabled: false, reason: "Push notifications are available in the Android app." };
  }

  const deviceId = await registerAndroidDevice();
  if (!deviceId) {
    return { enabled: false, reason: "Sign in to register this Android device." };
  }

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") {
    permission = await PushNotifications.requestPermissions();
  }

  if (permission.receive !== "granted") {
    return { enabled: false, reason: "Notification permission was not granted." };
  }

  await registerFcmTokenForDevice(deviceId);
  return { enabled: true };
}
