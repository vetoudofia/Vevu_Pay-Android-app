import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PushNotifications } from "@capacitor/push-notifications";
import type { Router } from "@tanstack/react-router";

let initialized = false;

/** Native-only lifecycle and system UI integration. */
export async function initializeNativeRuntime(router: Router): Promise<void> {
  if (!Capacitor.isNativePlatform() || initialized) return;
  initialized = true;

  try {
    await StatusBar.setBackgroundColor({ color: "#0a1128" });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // System-bar configuration is best-effort on supported Android versions.
  }

  try {
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      window.dispatchEvent(
        new CustomEvent("vevupay:push-received", { detail: notification }),
      );
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const rawLink = action.notification.data?.link;
      const safeLink =
        typeof rawLink === "string" &&
        rawLink.startsWith("/") &&
        !rawLink.startsWith("//") &&
        !rawLink.includes("\\")
          ? rawLink
          : "/notifications";
      router.history.push(safeLink);
    });
  } catch {
    // Notification listeners are installed only on supported native builds.
  }

  try {
    await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || router.history.canGoBack()) {
        router.history.back();
        return;
      }
      void App.exitApp();
    });
  } catch {
    // Keep the app usable even if the native back listener is unavailable.
  }

  try {
    await SplashScreen.hide();
  } catch {
    // Splash screen may already have been dismissed by the native runtime.
  }
}

export function isNativeVevuPayApp(): boolean {
  return Capacitor.isNativePlatform();
}
