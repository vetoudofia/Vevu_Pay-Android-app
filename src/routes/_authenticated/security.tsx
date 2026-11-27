import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ShieldCheck,
  KeyRound,
  Key,
  ShieldAlert,
  Fingerprint,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { callEdgeFunction } from "@/lib/edge-function";
import { checkNativeBiometric, isNativeAndroid } from "@/native/biometric";

export const Route = createFileRoute("/_authenticated/security")({
  validateSearch: (search: Record<string, unknown>) => ({
    setupPin:
      search.setupPin === "1" || search.setupPin === true ? "1" : undefined,
  }),
  head: () => ({
    meta: [{ title: "Security Settings — VevuPay" }],
  }),
  component: SecurityPage,
});

type PasswordMode = "change" | "reset";
type PasswordStep = "initial" | "otp";
type PinOperation = "setup" | "change" | "reset";
type PinStep = "initial" | "otp";
type PinOTPPurpose = "pin_change" | "pin_reset";
type SecurityOTPPurpose =
  | "password_change"
  | "password_reset"
  | "pin_change"
  | "pin_reset";

function sanitizeErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed && trimmed.length <= 180) {
      return trimmed;
    }
  }
  return fallback;
}

async function getEdgeErrorMessage(
  error: any,
  fallback = "Something went wrong. Please try again.",
): Promise<string> {
  if (!error) return fallback;

  const context = error.context;

  if (context instanceof Response) {
    try {
      const response = context.clone();
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        const body = await response.json();

        if (body?.error) return sanitizeErrorMessage(body.error, fallback);
        if (body?.message) return sanitizeErrorMessage(body.message, fallback);
        if (body?.details) return sanitizeErrorMessage(body.details, fallback);
      } else {
        const responseText = await response.text();

        if (responseText) {
          try {
            const body = JSON.parse(responseText);

            if (body?.error) return sanitizeErrorMessage(body.error, fallback);
            if (body?.message) return sanitizeErrorMessage(body.message, fallback);
          } catch {
            return sanitizeErrorMessage(responseText, fallback);
          }
        }
      }
    } catch {
      // Continue to other error sources.
    }
  }

  if (typeof error.message === "string") {
    try {
      const parsed = JSON.parse(error.message);

      if (parsed?.error) return sanitizeErrorMessage(parsed.error, fallback);
      if (parsed?.message) return sanitizeErrorMessage(parsed.message, fallback);
    } catch {
      // Ordinary text message.
    }

    if (error.message.trim()) {
      return sanitizeErrorMessage(error.message, fallback);
    }
  }

  if (typeof error.error === "string") {
    return sanitizeErrorMessage(error.error, fallback);
  }

  return fallback;
}

async function invokeEdgeFunction(
  functionName: string,
  body: Record<string, any>,
): Promise<any> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    const message = await getEdgeErrorMessage(
      error,
      `Unable to complete ${functionName.replace(/-/g, " ")}.`,
    );

    throw new Error(message);
  }

  return data;
}

function requireSuccess(data: any, fallback: string) {
  if (!data || typeof data !== "object") {
    throw new Error(fallback);
  }

  const status = String(data.status || "").toLowerCase();

  if (
    data.success === false ||
    data.status === false ||
    status === "error" ||
    status === "failed"
  ) {
    throw new Error(sanitizeErrorMessage(data.error || data.message, fallback));
  }

  if (
    data.success !== true &&
    status !== "success" &&
    status !== "ok"
  ) {
    throw new Error(sanitizeErrorMessage(data.error || data.message, fallback));
  }

  return data;
}

function SecurityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setupPin } = Route.useSearch();

  // PASSWORD STATES

  const [loadingPassword, setLoadingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("change");
  const [passwordStep, setPasswordStep] = useState<PasswordStep>("initial");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordOtpCode, setPasswordOtpCode] = useState("");

  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordResendSeconds, setPasswordResendSeconds] = useState(0);

  // TRANSACTION PIN STATES

  const [fetchingPin, setFetchingPin] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [loadingPin, setLoadingPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);

  const [pinOperation, setPinOperation] = useState<PinOperation>("setup");
  const [pinStep, setPinStep] = useState<PinStep>("initial");

  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinOtpCode, setPinOtpCode] = useState("");
  const [pinResendSeconds, setPinResendSeconds] = useState(0);

  const [securityLoadError, setSecurityLoadError] = useState("");

  // ACCOUNT-WIDE BIOMETRIC SETTINGS (read-only until secure attestation is supported)
  const [biometricLoading, setBiometricLoading] = useState(true);
  const [biometricRefreshing, setBiometricRefreshing] = useState(false);
  const [biometricError, setBiometricError] = useState("");
  const [biometricSettings, setBiometricSettings] = useState<any>(null);
  const [nativeBiometric, setNativeBiometric] = useState<{
    available: boolean;
    strongBiometry: boolean;
    reason?: string;
  } | null>(null);

  // COUNTDOWN TIMERS

  useEffect(() => {
    if (passwordResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setPasswordResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [passwordResendSeconds > 0]);

  useEffect(() => {
    if (pinResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setPinResendSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [pinResendSeconds > 0]);

  const formatCountdown = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // FETCH SECURITY SETTINGS

  useEffect(() => {
    let cancelled = false;

    const fetchSecuritySettings = async () => {
      if (!user) {
        setFetchingPin(false);
        return;
      }

      setFetchingPin(true);
      setSecurityLoadError("");

      try {
        const pinStatus = await invokeEdgeFunction(
          "get-transaction-pin-status",
          {},
        );

        requireSuccess(
          pinStatus,
          "Unable to retrieve transaction PIN status.",
        );

        if (typeof pinStatus.hasPin !== "boolean") {
          throw new Error("Invalid transaction PIN status response.");
        }

        if (cancelled) return;

        setHasPin(pinStatus.hasPin);
        setPinOperation(pinStatus.hasPin ? "change" : "setup");

        if (!pinStatus.hasPin && setupPin === "1") {
          setShowChangePin(true);
          setPinStep("initial");
        }
      } catch (error: any) {
        if (cancelled) return;

        const message = await getEdgeErrorMessage(
          error,
          "Unable to load your security settings.",
        );

        setSecurityLoadError(message);
        toast.error(message);
      } finally {
        if (!cancelled) {
          setFetchingPin(false);
        }
      }
    };

    void fetchSecuritySettings();

    return () => {
      cancelled = true;
    };
  }, [user?.id, setupPin]);

  useEffect(() => {
    let cancelled = false;

    const loadBiometricSettings = async () => {
      setBiometricLoading(true);
      setBiometricError("");

      try {
        const [settingsResult, availability] = await Promise.all([
          invokeEdgeFunction("device-management", {
            action: "get_biometric_settings",
          }),
          checkNativeBiometric().catch((error) => ({
            available: false,
            strongBiometry: false,
            reason: error instanceof Error ? error.message : "Unable to check this device's biometric hardware.",
          })),
        ]);

        requireSuccess(
          settingsResult,
          "Unable to retrieve biometric settings.",
        );

        if (cancelled) return;
        setBiometricSettings(settingsResult.settings ?? settingsResult);
        setNativeBiometric(availability);
      } catch (error: any) {
        if (cancelled) return;
        const message = await getEdgeErrorMessage(
          error,
          "Unable to load biometric settings.",
        );
        setBiometricError(message);
      } finally {
        if (!cancelled) {
          setBiometricLoading(false);
          setBiometricRefreshing(false);
        }
      }
    };

    void loadBiometricSettings();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // SHARED OTP VERIFICATION STEP (SETS verified_at ON email_otps)

  const verifyEmailOtp = async (
    emailAddress: string,
    otpCode: string,
    purpose: SecurityOTPPurpose,
  ) => {
    const result = await callEdgeFunction("verify-otp", {
      email: emailAddress.trim().toLowerCase(),
      otpCode: otpCode.trim(),
      purpose,
    });

    return requireSuccess(
      result,
      "The verification code is invalid, expired, or already used.",
    );
  };

  // PASSWORD VALIDATION

  const validateNewPassword = () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return false;
    }

    if (newPassword.length > 128) {
      toast.error("New password is too long.");
      return false;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return false;
    }

    if (
      passwordMode === "change" &&
      currentPassword === newPassword
    ) {
      toast.error(
        "New password must be different from your current password.",
      );
      return false;
    }

    return true;
  };

  // SEND PASSWORD OTP

  const sendPasswordOTP = async () => {
    if (!user?.email) {
      toast.error("Unable to identify your registered email.");
      return;
    }

    if (loadingPassword || passwordResendSeconds > 0) return;

    if (!validateNewPassword()) return;

    if (passwordMode === "change" && !currentPassword) {
      toast.error("Please enter your current password.");
      return;
    }

    setLoadingPassword(true);

    try {
      const purpose =
        passwordMode === "change"
          ? "password_change"
          : "password_reset";

      const data = await invokeEdgeFunction("send-otp", {
        purpose,
        ...(passwordMode === "reset" ? { email: user.email } : {}),
      });

      requireSuccess(data, "Could not send verification code.");

      setPasswordStep("otp");
      setPasswordOtpCode("");
      setPasswordResendSeconds(60);

      toast.success(
        sanitizeErrorMessage(
          data.message,
          passwordMode === "change"
            ? "Password change verification code sent."
            : "Password reset verification code sent.",
        ),
      );
    } catch (error: any) {
      const message = await getEdgeErrorMessage(
        error,
        "Failed to send verification code.",
      );

      toast.error(message);
    } finally {
      setLoadingPassword(false);
    }
  };

  // CHANGE OR RESET PASSWORD WITH OTP

  const handleVerifyAndChangePassword = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    const trimmedCode = passwordOtpCode.trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      toast.error("Enter the six-digit verification code.");
      return;
    }

    if (!validateNewPassword()) return;
    if (loadingPassword) return;

    if (!user?.email) {
      toast.error("Unable to identify your registered account.");
      return;
    }

    setLoadingPassword(true);

    try {
      const normalizedEmail = user.email.trim().toLowerCase();
      const purpose =
        passwordMode === "change"
          ? "password_change"
          : "password_reset";

      await verifyEmailOtp(normalizedEmail, trimmedCode, purpose);

      if (passwordMode === "change") {
        const changeData = await invokeEdgeFunction(
          "secure-password-change",
          {
            email: normalizedEmail,
            currentPassword,
            newPassword,
            otpCode: trimmedCode,
          },
        );

        requireSuccess(changeData, "Password change failed.");

        toast.success(
          sanitizeErrorMessage(
            changeData.message,
            "Password changed successfully!",
          ),
        );

        if (changeData.securityWarning) {
          toast.warning(
            sanitizeErrorMessage(
              changeData.securityWarning,
              "Please sign in again on other devices.",
            ),
          );
        }
      } else {
        const resetData = await invokeEdgeFunction(
          "reset-password-with-otp",
          {
            email: normalizedEmail,
            otpCode: trimmedCode,
            newPassword,
          },
        );

        requireSuccess(resetData, "Password reset failed.");

        toast.success(
          sanitizeErrorMessage(
            resetData.message,
            "Your password has been reset successfully!",
          ),
        );

        if (resetData.securityWarning) {
          toast.warning(
            sanitizeErrorMessage(
              resetData.securityWarning,
              "Please sign in again on other devices.",
            ),
          );
        }
      }

      resetPasswordChange();
    } catch (error: any) {
      const message = await getEdgeErrorMessage(
        error,
        "Failed to update password.",
      );

      setPasswordOtpCode("");
      toast.error(message);
    } finally {
      setLoadingPassword(false);
    }
  };

  const resetPasswordChange = () => {
    setShowChangePassword(false);
    setPasswordMode("change");
    setPasswordStep("initial");

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordOtpCode("");

    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);

    setPasswordResendSeconds(0);
  };

  const handleForgotPassword = () => {
    setPasswordMode("reset");
    setPasswordStep("initial");

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordOtpCode("");

    setShowCurrentPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);

    setPasswordResendSeconds(0);
  };

  const handleReturnToChangePassword = () => {
    setPasswordMode("change");
    setPasswordStep("initial");

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordOtpCode("");

    setPasswordResendSeconds(0);
  };

  // TRANSACTION PIN VALIDATION & SAVE

  const validateNewPin = () => {
    if (!/^\d{6}$/.test(newPin)) {
      toast.error("New PIN must contain exactly 6 digits.");
      return false;
    }

    if (newPin !== confirmPin) {
      toast.error("PINs do not match.");
      return false;
    }

    if (pinOperation === "change") {
      if (!/^\d{6}$/.test(currentPin)) {
        toast.error("Enter your current six-digit PIN.");
        return false;
      }

      if (currentPin === newPin) {
        toast.error("Your new PIN must be different.");
        return false;
      }
    }

    return true;
  };

  const verifyCurrentPin = async () => {
    if (!/^\d{6}$/.test(currentPin)) {
      throw new Error(
        "Enter your current six-digit transaction PIN.",
      );
    }

    const result = await callEdgeFunction("set-transaction-pin", {
      operation: "verify_current",
      current_pin: currentPin,
    });

    return requireSuccess(
      result,
      "Incorrect current transaction PIN.",
    );
  };

  const saveTransactionPin = async (
    verifiedOtpCode?: string,
  ) => {
    const requestBody: {
      operation: PinOperation;
      new_pin: string;
      current_pin?: string;
      otpCode?: string;
    } = {
      operation: pinOperation,
      new_pin: newPin,
    };

    if (pinOperation === "change") {
      requestBody.current_pin = currentPin;
    }

    if (verifiedOtpCode) {
      requestBody.otpCode = verifiedOtpCode;
    }

    const result = await callEdgeFunction(
      "set-transaction-pin",
      requestBody,
    );

    return requireSuccess(result, "Failed to save transaction PIN.");
  };

  const sendPinOTP = async () => {
    if (!user) {
      toast.error("Please sign in again.");
      return;
    }

    if (loadingPin || pinResendSeconds > 0) return;
    if (!validateNewPin()) return;

    setLoadingPin(true);

    try {
      if (pinOperation === "change") {
        await verifyCurrentPin();
      }

      const purpose: PinOTPPurpose =
        pinOperation === "reset" ? "pin_reset" : "pin_change";

      const result = await callEdgeFunction("send-otp", {
        purpose,
      });

      requireSuccess(result, "Unable to send verification code.");

      setPinStep("otp");
      setPinOtpCode("");
      setPinResendSeconds(60);

      toast.success(
        sanitizeErrorMessage(
          result.message,
          "Verification code sent to your registered email.",
        ),
      );
    } catch (error: any) {
      const message = await getEdgeErrorMessage(
        error,
        "Could not send verification code.",
      );

      toast.error(message);
    } finally {
      setLoadingPin(false);
    }
  };

  const handlePinContinue = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error("Please sign in again.");
      return;
    }

    if (pinOperation === "setup") {
      if (loadingPin) return;
      if (!validateNewPin()) return;

      setLoadingPin(true);

      try {
        const data = await saveTransactionPin();

        toast.success(
          sanitizeErrorMessage(
            data.message,
            "Transaction PIN created successfully.",
          ),
        );

        setHasPin(true);
        setPinOperation("change");
        setShowChangePin(false);
        setPinStep("initial");
        setCurrentPin("");
        setNewPin("");
        setConfirmPin("");
        setPinOtpCode("");
        setPinResendSeconds(0);
      } catch (error: any) {
        const message = await getEdgeErrorMessage(
          error,
          "Unable to create transaction PIN.",
        );

        setNewPin("");
        setConfirmPin("");
        toast.error(message);
      } finally {
        setLoadingPin(false);
      }

      return;
    }

    await sendPinOTP();
  };

  const handleVerifyAndSavePin = async (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    const trimmedCode = pinOtpCode.trim();

    if (!/^\d{6}$/.test(trimmedCode)) {
      toast.error("Enter the six-digit verification code.");
      return;
    }

    if (loadingPin) return;

    if (!user?.email) {
      toast.error(
        "Your account email could not be found. Please sign in again.",
      );
      return;
    }

    setLoadingPin(true);

    try {
      const operationBeingSaved = pinOperation;
      const purpose: PinOTPPurpose =
        operationBeingSaved === "reset" ? "pin_reset" : "pin_change";

      await verifyEmailOtp(user.email, trimmedCode, purpose);

      const data = await saveTransactionPin(trimmedCode);

      toast.success(
        sanitizeErrorMessage(
          data.message,
          operationBeingSaved === "reset"
            ? "Transaction PIN reset successfully."
            : "Transaction PIN changed successfully.",
        ),
      );

      setHasPin(true);
      setPinOperation("change");

      setShowChangePin(false);
      setPinStep("initial");

      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setPinOtpCode("");
      setPinResendSeconds(0);
    } catch (error: any) {
      const message = await getEdgeErrorMessage(
        error,
        "Unable to save transaction PIN.",
      );

      setPinOtpCode("");
      toast.error(message);
    } finally {
      setLoadingPin(false);
    }
  };

  const handleForgotPin = () => {
    setPinOperation("reset");

    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinOtpCode("");

    setPinStep("initial");
    setPinResendSeconds(0);
  };

  const resetPinChange = () => {
    setShowChangePin(false);

    setPinOperation(hasPin ? "change" : "setup");
    setPinStep("initial");

    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinOtpCode("");
    setPinResendSeconds(0);
  };

  // PAGE UI

  return (
    <>
      <button
        type="button"
        onClick={() => navigate({ to: "/settings" })}
        className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </button>

      <h1 className="mb-6 text-2xl font-bold">
        🔒 Security Settings
      </h1>

      {securityLoadError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4"
        >
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

            <div className="flex-1">
              <p className="text-sm font-semibold">
                Security settings could not be loaded.
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                {securityLoadError}
              </p>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 text-sm font-semibold text-primary hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PASSWORD SECTION */}

      <div className="surface mb-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-red-500" />

            <div>
              <h2 className="text-lg font-semibold">
                Change Password
              </h2>

              <p className="text-sm text-muted-foreground">
                Update your account password securely
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showChangePassword) {
                resetPasswordChange();
              } else {
                setShowChangePassword(true);
              }
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {showChangePassword ? "Cancel" : "Change"}
          </button>
        </div>

        {/* PASSWORD CHANGE / RESET FORM */}

        {showChangePassword && (
          <div className="mt-5 space-y-4">
            {passwordStep === "initial" ? (
              <>
                {passwordMode === "change" && (
                  <div className="relative">
                    <input
                      type={showCurrentPw ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="input-field pr-10"
                      autoComplete="current-password"
                    />

                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      aria-label={
                        showCurrentPw
                          ? "Hide current password"
                          : "Show current password"
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showCurrentPw ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}

                <div className="relative">
                  <input
                    type={showNewPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (minimum 8 characters)"
                    className="input-field pr-10"
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    aria-label={
                      showNewPw ? "Hide new password" : "Show new password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showNewPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showConfirmPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="input-field pr-10"
                    autoComplete="new-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(!showConfirmPw)}
                    aria-label={
                      showConfirmPw
                        ? "Hide confirm password"
                        : "Show confirm password"
                    }
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showConfirmPw ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                    <p className="text-xs text-muted-foreground">
                      {passwordMode === "change"
                        ? "We'll send an email verification code and verify your current password before changing your password."
                        : "We'll send a password reset code to your registered email. You won't need your current password."}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={sendPasswordOTP}
                    disabled={loadingPassword}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {loadingPassword && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}

                    {loadingPassword
                      ? "Processing..."
                      : passwordMode === "change"
                        ? "Verify & Continue"
                        : "Send Reset Code"}
                  </button>

                  <button
                    type="button"
                    onClick={resetPasswordChange}
                    disabled={loadingPassword}
                    className="rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90"
                  >
                    Cancel
                  </button>
                </div>

                {passwordMode === "change" ? (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loadingPassword}
                    className="w-full pt-2 text-sm font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Forgot Password?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleReturnToChangePassword}
                    disabled={loadingPassword}
                    className="w-full pt-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    I remember my current password
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="rounded-lg border border-primary/20 bg-primary/10 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    {passwordMode === "reset" ? (
                      <KeyRound className="h-5 w-5 text-primary" />
                    ) : (
                      <Mail className="h-5 w-5 text-primary" />
                    )}

                    <p className="text-sm font-medium">
                      {passwordMode === "reset"
                        ? "Reset your password"
                        : "Verify your email address"}
                    </p>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Enter the six-digit code sent to your registered email
                    address.
                  </p>
                </div>

                <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-center">
                  <p className="text-xs font-semibold text-foreground">
                    Didn't see it?{" "}
                    <span className="font-bold text-primary">
                      Check your Spam folder.
                    </span>
                  </p>

                  <div className="text-xs text-muted-foreground">
                    {passwordResendSeconds > 0 ? (
                      <span>
                        Resend available in{" "}
                        <strong className="font-mono text-foreground">
                          {formatCountdown(passwordResendSeconds)}
                        </strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={sendPasswordOTP}
                        disabled={loadingPassword}
                        className="font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>

                <form
                  onSubmit={handleVerifyAndChangePassword}
                  className="space-y-4"
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={passwordOtpCode}
                    onChange={(e) =>
                      setPasswordOtpCode(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    placeholder="000000"
                    maxLength={6}
                    className="input-field text-center font-mono text-2xl tracking-[0.7em]"
                    required
                    autoFocus
                  />

                  <button
                    type="submit"
                    disabled={
                      loadingPassword || passwordOtpCode.length !== 6
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {loadingPassword && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}

                    {loadingPassword
                      ? "Verifying..."
                      : "Verify & Save"}
                  </button>
                </form>
              </>
            )}
          </div>
        )}
      </div>

      {/* BIOMETRIC SETTINGS SECTION */}
      <section className="surface mb-4 p-6" aria-labelledby="biometric-settings-title">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Fingerprint className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 id="biometric-settings-title" className="text-lg font-semibold">
                Biometric Security
              </h2>
              <p className="text-sm text-muted-foreground">
                Use your device biometrics for account access and financial actions.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setBiometricRefreshing(true);
              void (async () => {
                try {
                  const [settingsResult, availability] = await Promise.all([
                    invokeEdgeFunction("device-management", { action: "get_biometric_settings" }),
                    checkNativeBiometric().catch((error) => ({
                      available: false,
                      strongBiometry: false,
                      reason: error instanceof Error ? error.message : "Unable to check biometric hardware.",
                    })),
                  ]);
                  requireSuccess(settingsResult, "Unable to retrieve biometric settings.");
                  setBiometricSettings(settingsResult.settings ?? settingsResult);
                  setNativeBiometric(availability);
                  setBiometricError("");
                } catch (error: any) {
                  setBiometricError(await getEdgeErrorMessage(error, "Unable to load biometric settings."));
                } finally {
                  setBiometricRefreshing(false);
                }
              })();
            }}
            disabled={biometricLoading || biometricRefreshing}
            aria-label="Refresh biometric settings"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${biometricRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {biometricLoading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading biometric settings...
          </div>
        ) : biometricError ? (
          <div role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-muted-foreground">
            {biometricError}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Account-wide biometric login</p>
                  <p className="text-xs text-muted-foreground">
                    {(biometricSettings?.biometric_enabled ?? biometricSettings?.biometrics_enabled) === true
                      ? "Enabled on your registered device"
                      : "Currently disabled"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${(biometricSettings?.biometric_enabled ?? biometricSettings?.biometrics_enabled) === true ? "bg-green-500/10 text-green-600" : "bg-secondary text-muted-foreground"}`}>
                  {(biometricSettings?.biometric_enabled ?? biometricSettings?.biometrics_enabled) === true ? "On" : "Off"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    toast.info("Biometric enrollment must be completed by the device-management security flow before this setting can be changed.");
                  }}
                  title="Manage biometric enrollment"
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  {(biometricSettings?.biometric_enabled ?? biometricSettings?.biometrics_enabled) === true ? "Disable" : "Enable"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Also use biometrics for purchases and transfers</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    One setting for both purchases and wallet transfers. It can only be enabled when account biometrics are active.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${biometricSettings?.transaction_biometrics_enabled === true ? "bg-green-500/10 text-green-600" : "bg-secondary text-muted-foreground"}`}>
                    {biometricSettings?.transaction_biometrics_enabled === true ? "On" : "Off"}
                  </span>
                  <input
                    type="checkbox"
                    checked={biometricSettings?.transaction_biometrics_enabled === true}
                    onChange={(event) => {
                      setBiometricSettings((previous: any) => ({
                        ...previous,
                        transaction_biometrics_enabled: event.target.checked,
                      }));
                      toast.info("This selection is displayed locally only until the server-side biometric setting action is connected.");
                    }}
                    aria-label="Use biometrics for purchases and transfers"
                    className="h-4 w-4 accent-primary"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Secure enrollment is not available yet</p>
                  <p className="mt-1">
                    Biometric changes are temporarily unavailable until the server can verify Android Keystore hardware attestation. This prevents a device-only switch from falsely enabling account or payment security.
                  </p>
                  {!isNativeAndroid() && (
                    <p className="mt-2">Open the VevuPay Android app to check device biometric support.</p>
                  )}
                  {isNativeAndroid() && nativeBiometric && !nativeBiometric.available && (
                    <p className="mt-2">Device check: {nativeBiometric.reason || "Biometric authentication is unavailable on this device."}</p>
                  )}
                  {isNativeAndroid() && nativeBiometric?.available && (
                    <p className="mt-2">Device biometrics are detected, but server-side hardware attestation is still required before activation.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* TRANSACTION PIN SECTION */}

      <div className="surface mb-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-primary" />

            <div>
              <h2 className="text-lg font-semibold">
                Transaction PIN
              </h2>

              <p className="text-sm text-muted-foreground">
                {fetchingPin
                  ? "Loading PIN status..."
                  : hasPin
                    ? "Manage your 6-digit transaction authorization PIN"
                    : "Set up a 6-digit PIN"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (showChangePin) {
                resetPinChange();
              } else {
                setShowChangePin(true);
                setPinOperation(hasPin ? "change" : "setup");
                setPinStep("initial");
              }
            }}
            disabled={fetchingPin}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {showChangePin
              ? "Cancel"
              : hasPin
                ? "Change"
                : "Set PIN"}
          </button>
        </div>

        {showChangePin && (
          <div className="mt-5 space-y-4 border-t border-border pt-4">
            {fetchingPin ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pinStep === "initial" ? (
              <form
                onSubmit={handlePinContinue}
                className="space-y-4"
              >
                {pinOperation === "change" && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Current PIN
                    </label>

                    <input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={currentPin}
                      onChange={(e) =>
                        setCurrentPin(
                          e.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      className="input-field text-center font-mono text-2xl tracking-[0.5em]"
                      placeholder="••••••"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    New PIN
                  </label>

                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) =>
                      setNewPin(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    className="input-field text-center font-mono text-2xl tracking-[0.5em]"
                    placeholder="••••••"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Confirm PIN
                  </label>

                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) =>
                      setConfirmPin(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    className="input-field text-center font-mono text-2xl tracking-[0.5em]"
                    placeholder="••••••"
                    required
                  />
                </div>

                <div className="rounded-lg border border-primary/20 bg-primary/10 p-3">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />

                    <p className="text-xs text-muted-foreground">
                      {pinOperation === "setup"
                        ? "Create your 6-digit transaction PIN now. No email verification code is required for initial PIN setup."
                        : pinOperation === "reset"
                          ? "We'll send a verification code to your registered email before resetting your transaction PIN."
                          : "Your current PIN will be verified first. We'll then send an email verification code before changing your transaction PIN."}
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loadingPin}
                  className="btn-primary flex w-full items-center justify-center py-3 disabled:opacity-50"
                >
                  {loadingPin && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  {loadingPin
                    ? pinOperation === "setup"
                      ? "Creating PIN..."
                      : "Sending verification code..."
                    : pinOperation === "setup"
                      ? "Create PIN"
                      : pinOperation === "reset"
                        ? "Send Reset Code"
                        : "Verify & Continue"}
                </button>

                {pinOperation === "change" && hasPin && (
                  <button
                    type="button"
                    onClick={handleForgotPin}
                    disabled={loadingPin}
                    className="w-full text-sm font-semibold text-primary hover:underline"
                  >
                    Forgot PIN?
                  </button>
                )}
              </form>
            ) : (
              <form
                onSubmit={handleVerifyAndSavePin}
                className="space-y-4"
              >
                <div>
                  <h3 className="mb-1 text-lg font-bold">
                    Verify your email
                  </h3>

                  <p className="text-xs text-muted-foreground">
                    {pinOperation === "reset"
                      ? "Enter the six-digit code sent to your registered email to reset your transaction PIN."
                      : "Enter the six-digit code sent to your registered email to change your transaction PIN."}
                  </p>
                </div>

                <div className="space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-center">
                  <p className="text-xs font-semibold text-foreground">
                    Didn't see it?{" "}
                    <span className="font-bold text-primary">
                      Check your Spam folder.
                    </span>
                  </p>

                  <div className="text-xs text-muted-foreground">
                    {pinResendSeconds > 0 ? (
                      <span>
                        Resend available in{" "}
                        <strong className="font-mono text-foreground">
                          {formatCountdown(pinResendSeconds)}
                        </strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={sendPinOTP}
                        disabled={loadingPin}
                        className="font-semibold text-primary hover:underline disabled:opacity-50"
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={pinOtpCode}
                  onChange={(e) =>
                    setPinOtpCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  className="input-field text-center font-mono text-2xl tracking-[0.7em]"
                  placeholder="000000"
                  required
                  autoFocus
                />

                <button
                  type="submit"
                  disabled={loadingPin || pinOtpCode.length !== 6}
                  className="btn-primary flex w-full items-center justify-center py-3 disabled:opacity-50"
                >
                  {loadingPin && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  {loadingPin
                    ? "Verifying..."
                    : pinOperation === "reset"
                      ? "Verify & Reset PIN"
                      : "Verify & Change PIN"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </>
  );
}
