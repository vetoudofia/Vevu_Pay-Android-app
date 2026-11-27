import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { Device } from "@capacitor/device";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { getPersistentDeviceId } from "@/native/device-registration";

type NativeUpdaterPlugin = {
  downloadApk(options: { url: string; sha256?: string | null; versionCode: number }): Promise<{ path: string; sizeBytes: number; sha256: string }>;
  installApk(options: { path: string }): Promise<void>;
  cleanupDownloads(): Promise<void>;
  addListener(eventName: "downloadProgress", listenerFunc: (progress: { bytesDownloaded: number; totalBytes: number; percent: number }) => void): Promise<PluginListenerHandle>;
};

const NativeUpdater = registerPlugin<NativeUpdaterPlugin>("VevuPayUpdater");

type Release = {
  id: string;
  version_name: string;
  version_code: number;
  minimum_supported_version_code: number;
  release_notes: string;
  download_url: string | null;
  play_store_url: string | null;
  sha256: string | null;
  file_size_bytes: number | null;
  is_mandatory: boolean;
  published_at: string | null;
};

type ReleaseCheckResponse = {
  success: boolean;
  update_available: boolean;
  mandatory_update: boolean;
  release: Release | null;
};

type PendingDownload = {
  release_id: string;
  distribution_channel: "direct" | "play";
  target_version_code: number;
};

const CHANNEL = import.meta.env.VITE_DISTRIBUTION_CHANNEL === "play" ? "play" : "direct";
const FALLBACK_VERSION_CODE = Number.parseInt(import.meta.env.VITE_APP_VERSION_CODE || "1", 10);
const PENDING_DOWNLOAD_KEY = "vevupay_pending_app_release_download";

function readPendingDownload(): PendingDownload | null {
  try {
    const raw = window.localStorage.getItem(PENDING_DOWNLOAD_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as PendingDownload;
    if (
      typeof value.release_id !== "string" ||
      (value.distribution_channel !== "direct" && value.distribution_channel !== "play") ||
      !Number.isSafeInteger(value.target_version_code)
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Native-only release gate. Update checks are public; installation reporting
 * is authenticated. A download is considered completed only after the app is
 * launched again with the target version installed.
 */
export function AppReleaseManager() {
  const { user } = useAuth();
  const [release, setRelease] = useState<Release | null>(null);
  const [mandatory, setMandatory] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "downloading" | "installing">("idle");
  const [downloadBytes, setDownloadBytes] = useState({ downloaded: 0, total: 0 });
  const [dismissedReleaseId, setDismissedReleaseId] = useState<string | null>(null);
  const currentVersionCodeRef = useRef(FALLBACK_VERSION_CODE);
  const checkInFlightRef = useRef(false);

  const getInstalledAppInfo = useCallback(async () => {
    const nativeInfo = await App.getInfo();
    const parsedBuild = Number.parseInt(nativeInfo.build || "", 10);
    const versionCode = Number.isSafeInteger(parsedBuild) && parsedBuild > 0
      ? parsedBuild
      : FALLBACK_VERSION_CODE;
    currentVersionCodeRef.current = versionCode;
    return { versionName: nativeInfo.version || import.meta.env.VITE_APP_VERSION || "1.0.0", versionCode, appBuild: nativeInfo.build || String(versionCode) };
  }, []);

  const recordDownloadEvent = useCallback(async (
    pending: PendingDownload,
    eventType: "requested" | "completed",
    currentVersionCode: number,
    deviceId: string | null,
  ) => {
    const { error } = await supabase.functions.invoke("record-app-release-download", {
      body: {
        release_id: pending.release_id,
        distribution_channel: pending.distribution_channel,
        event_type: eventType,
        app_version_code: currentVersionCode,
        device_id: deviceId,
      },
    });
    if (error) throw error;
  }, []);

  const reportInstalledVersion = useCallback(async () => {
    if (!user) return;
    const [appInfo, deviceInfo, deviceId] = await Promise.all([
      getInstalledAppInfo(),
      Device.getInfo(),
      getPersistentDeviceId(),
    ]);
    const { error } = await supabase.functions.invoke("record-app-installed-version", {
      body: {
        platform: "android",
        distribution_channel: CHANNEL,
        device_id: deviceId,
        version_name: appInfo.versionName,
        version_code: appInfo.versionCode,
        device_name: [deviceInfo.manufacturer, deviceInfo.model]
          .filter(Boolean)
          .join(" ")
          .slice(0, 100) || "Android device",
        app_build: appInfo.appBuild.slice(0, 40),
      },
    });
    if (error) throw error;
  }, [getInstalledAppInfo, user]);

  const completePendingDownloadIfInstalled = useCallback(async (versionCode: number) => {
    const pending = readPendingDownload();
    if (!pending || versionCode < pending.target_version_code) return;

    try {
      const deviceId = await getPersistentDeviceId();
      await recordDownloadEvent(pending, "completed", versionCode, deviceId);
      window.localStorage.removeItem(PENDING_DOWNLOAD_KEY);
      await NativeUpdater.cleanupDownloads().catch(() => undefined);
    } catch {
      // Keep the pending record and retry on the next app activation.
    }
  }, [recordDownloadEvent]);

  const checkForUpdate = useCallback(async () => {
    if (Capacitor.getPlatform() !== "android" || checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    setChecking(true);
    try {
      const appInfo = await getInstalledAppInfo();
      await completePendingDownloadIfInstalled(appInfo.versionCode);

      const { data, error } = await supabase.functions.invoke<ReleaseCheckResponse>("get-app-release", {
        body: {
          platform: "android",
          distribution_channel: CHANNEL,
          current_version_code: appInfo.versionCode,
        },
      });
      if (error) throw error;
      if (data?.success && data.update_available && data.release) {
        setDismissedReleaseId((previous) => previous === data.release?.id ? previous : null);
        setRelease(data.release);
        setMandatory(data.mandatory_update === true);
      } else {
        setRelease(null);
        setMandatory(false);
      }
    } catch (error) {
      // Do not lock users out when the release service or network is unavailable.
      console.warn("VevuPay update check failed", error);
    } finally {
      checkInFlightRef.current = false;
      setChecking(false);
    }
  }, [completePendingDownloadIfInstalled, getInstalledAppInfo]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    void checkForUpdate();
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        // Android's package installer may have been cancelled or returned control.
        // Allow the user to retry rather than leaving the update button disabled.
        setDownloadStatus("idle");
        void checkForUpdate();
        if (user) void reportInstalledVersion().catch((error) => console.warn("Installed-version report failed", error));
      }
    }).then((handle) => {
      if (disposed) void handle.remove();
      else listener = handle;
    });
    return () => {
      disposed = true;
      void listener?.remove();
    };
  }, [checkForUpdate, reportInstalledVersion, user]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android" || !user) return;
    void reportInstalledVersion().catch((error) => console.warn("Installed-version report failed", error));
  }, [reportInstalledVersion, user]);

  const openUpdate = async () => {
    if (!release) return;
    setActionError(null);
    const url = CHANNEL === "play" ? release.play_store_url : release.download_url;
    if (!url) {
      setActionError("The update link is not available yet. Please try again later.");
      return;
    }
    try {
      if (new URL(url).protocol !== "https:") throw new Error("Only secure HTTPS update links are supported.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The update link is invalid.");
      return;
    }

    const pending: PendingDownload = {
      release_id: release.id,
      distribution_channel: CHANNEL,
      target_version_code: release.version_code,
    };
    try {
      const deviceId = await getPersistentDeviceId();
      try {
        await recordDownloadEvent(pending, "requested", currentVersionCodeRef.current, deviceId);
      } catch (error) {
        // Analytics failure must never prevent a user from obtaining an update.
        console.warn("Download request tracking failed", error);
      }
      window.localStorage.setItem(PENDING_DOWNLOAD_KEY, JSON.stringify(pending));
      if (CHANNEL === "play") {
        await Browser.open({ url, presentationStyle: "fullscreen" });
        return;
      }

      setDownloadStatus("downloading");
      setDownloadProgress(0);
      setDownloadBytes({ downloaded: 0, total: release.file_size_bytes || 0 });
      let progressListener: PluginListenerHandle | undefined;
      try {
        progressListener = await NativeUpdater.addListener("downloadProgress", (progress) => {
          setDownloadProgress(progress.percent >= 0 ? progress.percent : null);
          setDownloadBytes({ downloaded: progress.bytesDownloaded, total: progress.totalBytes || release.file_size_bytes || 0 });
        });
        const downloaded = await NativeUpdater.downloadApk({
          url,
          sha256: release.sha256,
          versionCode: release.version_code,
        });
        setDownloadStatus("installing");
        setDownloadProgress(100);
        await NativeUpdater.installApk({ path: downloaded.path });
      } finally {
        await progressListener?.remove();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to download or install the update.");
      setDownloadStatus("idle");
    }
  };

  if (Capacitor.getPlatform() !== "android" || !release || (!mandatory && dismissedReleaseId === release.id)) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-[#071126] px-5 py-8 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#101d38] p-6 shadow-2xl">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-2xl" aria-hidden="true">↻</div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">VevuPay update</p>
        <h1 className="mt-2 text-2xl font-bold">{mandatory ? "Update required" : "A new version is available"}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Version {release.version_name} is ready to install.
          {mandatory ? " You must update VevuPay before continuing." : " Update now to get the latest improvements."}
        </p>
        {release.release_notes?.trim() && (
          <div className="mt-5 rounded-2xl bg-white/5 p-4">
            <h2 className="text-sm font-semibold">What&apos;s new</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{release.release_notes}</p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400">
          <span>Build {release.version_code}</span>
          {formatFileSize(release.file_size_bytes) && <span>{formatFileSize(release.file_size_bytes)}</span>}
        </div>
        {downloadStatus !== "idle" && CHANNEL === "direct" && (
          <div className="mt-5 rounded-2xl bg-white/5 p-4" aria-live="polite">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>{downloadStatus === "downloading" ? "Downloading update…" : "Opening secure installer…"}</span>
              {downloadProgress !== null && <span>{downloadProgress}%</span>}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${downloadProgress ?? 5}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {downloadBytes.total > 0
                ? `${(downloadBytes.downloaded / 1048576).toFixed(1)} MB of ${(downloadBytes.total / 1048576).toFixed(1)} MB`
                : `${(downloadBytes.downloaded / 1048576).toFixed(1)} MB downloaded`}
            </p>
          </div>
        )}
        {actionError && <p role="alert" className="mt-4 text-sm text-rose-300">{actionError}</p>}
        <button
          type="button"
          onClick={() => void openUpdate()}
          disabled={checking || downloadStatus !== "idle"}
          className="mt-6 w-full rounded-xl bg-blue-500 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-blue-400 disabled:opacity-60"
        >
          {checking ? "Checking…" : downloadStatus === "downloading" ? "Downloading update…" : downloadStatus === "installing" ? "Opening installer…" : CHANNEL === "play" ? "Update in Google Play" : "Download update"}
        </button>
        {!mandatory && (
          <button
            type="button"
            onClick={() => setDismissedReleaseId(release.id)}
            className="mt-3 w-full rounded-xl px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-white/5"
          >
            Remind me later
          </button>
        )}
      </section>
    </div>
  );
}
