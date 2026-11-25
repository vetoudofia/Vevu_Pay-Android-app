// src/components/PrivacySettings.tsx
import { useState, useEffect } from "react";
import { toast } from "sonner";

interface PrivacySettingsData {
  shakeEnabled: boolean;
  fakeBalance: number;
  hideTransactions: boolean;
}

const DEFAULT_SETTINGS: PrivacySettingsData = {
  shakeEnabled: false,
  fakeBalance: 8250,
  hideTransactions: false,
};

export function PrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettingsData>(DEFAULT_SETTINGS);

  useEffect(() => {
    const saved = localStorage.getItem("vevupay_privacy_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      } catch {}
    }
  }, []);

  const updateSetting = <K extends keyof PrivacySettingsData>(
    key: K,
    value: PrivacySettingsData[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    try {
      localStorage.setItem("vevupay_privacy_settings", JSON.stringify(newSettings));
      localStorage.setItem("vevupay_fake_balance", String(newSettings.fakeBalance));
      window.dispatchEvent(new Event("privacySettingsChanged"));
    } catch {
      toast.error("Failed to save settings");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Shake to Hide Balance</h3>
          <p className="text-sm text-muted-foreground">
            Shake your phone to display a fake balance
          </p>
        </div>
        <button
          onClick={() => updateSetting("shakeEnabled", !settings.shakeEnabled)}
          className={`relative h-6 w-11 rounded-full transition ${
            settings.shakeEnabled ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
              settings.shakeEnabled ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>

      {settings.shakeEnabled && (
        <div className="pl-2">
          <label className="block text-sm font-medium mb-1">
            Fake Balance Amount (₦)
          </label>
          <input
            type="number"
            value={settings.fakeBalance}
            onChange={(e) =>
              updateSetting("fakeBalance", parseFloat(e.target.value) || 0)
            }
            className="w-full px-4 py-2 border rounded-lg bg-background"
            min={0}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Hide Transactions</h3>
          <p className="text-sm text-muted-foreground">
            Hide recent transactions on the home screen
          </p>
        </div>
        <button
          onClick={() => updateSetting("hideTransactions", !settings.hideTransactions)}
          className={`relative h-6 w-11 rounded-full transition ${
            settings.hideTransactions ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
              settings.hideTransactions ? "translate-x-5" : ""
            }`}
          />
        </button>
      </div>
    </div>
  );
}
