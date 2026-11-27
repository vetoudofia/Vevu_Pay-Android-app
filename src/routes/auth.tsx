import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
  Lock,
  ShieldAlert,
  LifeBuoy,
  Fingerprint,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Logo } from '@/components/Logo';
import { LegalModal } from '@/components/LegalModal';
import {
  supabase,
  callPublicEdgeFunction,
  clearSupabaseClientStorage,
} from '@/lib/supabase';

export const Route = createFileRoute('/auth')({
  ssr: false,
  head: () => ({
    meta: [
      {
        title: 'Sign in to Vevu Pay (VevuPay) — Bills, Airtime, Data & Exam Pins',
      },
      {
        name: 'description',
        content:
          'Sign in to Vevu Pay (VevuPay) to pay electricity and cable bills, buy airtime and data bundles, get exam pins, and manage your wallet.',
      },
    ],
  }),
  component: AuthPage,
});

type Mode =
  | 'signin'
  | 'signup'
  | 'signup-unverified'
  | 'signup-otp'
  | 'forgot-password'
  | 'otp-verify'
  | 'reset-password';

interface LoginRateLimitResponse {
  success: boolean;
  code?: string;
  error?: string;
  email?: string;
  session?: {
    access_token: string;
    refresh_token: string;
  };
}

interface BiometricChallengeResponse {
  success: boolean;
  error?: string;
  challenge_id?: string;
  challenge?: string;
  signed_message?: string;
  expires_at?: string;
  algorithm?: string;
}

interface BiometricVerifyResponse {
  success: boolean;
  error?: string;
  email?: string;
  email_otp?: string;
  retryAfterSeconds?: number;
}

const BIOMETRIC_PREF_KEY = 'vevupay_biometric_login_pref';
const DEVICE_ID_STORAGE_KEYS = [
  'vevupay_device_id',
  'device_id',
];

function readSavedBiometricPref(): {
  email: string;
  deviceId: string;
} | null {
  try {
    const raw = localStorage.getItem(BIOMETRIC_PREF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.email === 'string' &&
      parsed.email.trim() &&
      typeof parsed?.deviceId === 'string' &&
      parsed.deviceId.trim()
    ) {
      return {
        email: parsed.email.trim().toLowerCase(),
        deviceId: parsed.deviceId.trim(),
      };
    }
  } catch {
    // Ignore storage parse errors.
  }
  return null;
}

function saveBiometricPref(loginEmail: string, deviceId?: string | null) {
  try {
    const existing = readSavedBiometricPref();
    const resolvedDeviceId =
      (typeof deviceId === 'string' && deviceId.trim()) ||
      existing?.deviceId ||
      getStoredDeviceId() ||
      '';

    if (loginEmail.trim() && resolvedDeviceId) {
      localStorage.setItem(
        BIOMETRIC_PREF_KEY,
        JSON.stringify({
          email: loginEmail.trim().toLowerCase(),
          deviceId: resolvedDeviceId,
        })
      );
    }
  } catch {
    // Ignore storage errors.
  }
}

function getStoredDeviceId(): string {
  try {
    for (const key of DEVICE_ID_STORAGE_KEYS) {
      const val = localStorage.getItem(key);
      if (val && val.trim()) return val.trim();
    }
  } catch {
    // Ignore storage errors.
  }
  return '';
}

/**
 * Signs `signedMessage` using the Android Keystore ECDSA_P256_SHA256 biometric key.
 * Connects to a native/WebView bridge if available on `window`.
 */
async function signBiometricLoginChallenge(params: {
  email: string;
  deviceId: string;
  challengeId: string;
  challenge: string;
  signedMessage: string;
}): Promise<string> {
  const w = window as any;

  if (typeof w?.VevuBiometricBridge?.signLoginChallenge === 'function') {
    const sig = await w.VevuBiometricBridge.signLoginChallenge(
      JSON.stringify(params)
    );
    if (typeof sig === 'string' && sig.trim()) {
      return sig.trim();
    }
  }

  if (typeof w?.AndroidBiometric?.signChallenge === 'function') {
    const sig = await w.AndroidBiometric.signChallenge(params.signedMessage);
    if (typeof sig === 'string' && sig.trim()) {
      return sig.trim();
    }
  }

  throw new Error(
    'Biometric prompt is not available in this browser environment. Please use your email and password.'
  );
}

function readPendingSignup(): {
  email: string;
  expiry: number;
  referralCode?: string;
} | null {
  try {
    const saved = localStorage.getItem('vevupay_pending_signup');

    if (!saved) return null;

    const parsed = JSON.parse(saved);

    if (
      parsed?.email &&
      typeof parsed?.expiry === 'number' &&
      parsed.expiry > Date.now()
    ) {
      return {
        email: String(parsed.email).trim().toLowerCase(),
        expiry: parsed.expiry,
        referralCode:
          typeof parsed.referralCode === 'string'
            ? parsed.referralCode.trim().toUpperCase()
            : '',
      };
    }

    localStorage.removeItem('vevupay_pending_signup');
  } catch {
    // Ignore malformed storage.
  }

  return null;
}

function clearAuthFlowStorage() {
  try {
    localStorage.removeItem('vevupay_pending_signup');
    localStorage.removeItem('vevupay_resend_cooldown');
  } catch {
    // Ignore storage errors.
  }
}

function getSafeAuthError(err: any, fallback: string): string {
  const raw =
    typeof err === 'string'
      ? err
      : err?.body?.error || err?.data?.error || err?.message;

  if (!raw || typeof raw !== 'string') return fallback;

  return raw.trim() || fallback;
}

function AuthPage() {
  const { signUp, user, isLoading } = useAuth();
  const navigate = useNavigate();

  const initialPendingSignup = readPendingSignup();
  const initialBioPref = readSavedBiometricPref();

  const [mode, setMode] = useState<Mode>(() =>
    initialPendingSignup ? 'signup-otp' : 'signin'
  );

  const [email, setEmail] = useState(
    () => initialPendingSignup?.email || initialBioPref?.email || ''
  );

  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');

  const [referralCode, setReferralCode] = useState(
    () => initialPendingSignup?.referralCode || ''
  );

  const [signupOtp, setSignupOtp] = useState('');

  const [forgotEmail, setForgotEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw, setShowNewPw] = useState(false);

  const [busy, setBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalSlug, setLegalSlug] = useState<
    'terms' | 'privacy-policy' | null
  >(null);

  const [resendSeconds, setResendSeconds] = useState(0);

  // Unauth Support Modal States
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportEmail, setSupportEmail] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [supportSubmitted, setSupportSubmitted] = useState(false);

  const clearSensitiveFields = () => {
    setPassword('');
    setNewPassword('');
    setSignupOtp('');
    setOtpCode('');
  };

  useEffect(() => {
    const savedCooldown = localStorage.getItem(
      'vevupay_resend_cooldown'
    );

    if (savedCooldown) {
      const expiresAt = Number(savedCooldown);
      const remaining = Math.ceil((expiresAt - Date.now()) / 1000);

      if (remaining > 0) {
        setResendSeconds(remaining);
      } else {
        localStorage.removeItem('vevupay_resend_cooldown');
      }
    }
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setResendSeconds((current) => {
        if (current <= 1) {
          localStorage.removeItem('vevupay_resend_cooldown');
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSeconds > 0]);

  const startResendCountdown = () => {
    const seconds = 60;
    const expiresAt = Date.now() + seconds * 1000;

    localStorage.setItem(
      'vevupay_resend_cooldown',
      expiresAt.toString()
    );

    setResendSeconds(seconds);
  };

  const formatCountdown = () => {
    const minutes = Math.floor(resendSeconds / 60);
    const seconds = resendSeconds % 60;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  useEffect(() => {
    let active = true;

    if (!isLoading && user) {
      supabase
        .from('profiles')
        .select('is_verified, is_frozen')
        .eq('id', user.id)
        .maybeSingle()
        .then(async ({ data, error }) => {
          if (!active) return;
          if (error) return;

          if (data?.is_frozen) {
            await supabase.auth.signOut({ scope: 'local' });
            clearSupabaseClientStorage({ includeAccountKeys: true });
            clearAuthFlowStorage();
            clearSensitiveFields();

            toast.error(
              'This account is currently frozen. Please contact support at vevupaysecurity@gmail.com to unfreeze it.'
            );

            return;
          }

          if (data?.is_verified) {
            clearSensitiveFields();
            navigate({ to: '/dashboard', replace: true });
          } else {
            if (!readPendingSignup()) {
              await supabase.auth.signOut({ scope: 'local' });
              clearSupabaseClientStorage({ includeAccountKeys: false });
            }
          }
        });
    }

    return () => {
      active = false;
    };
  }, [user, isLoading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');

    if (ref) {
      setReferralCode(ref.trim().toUpperCase());
      setMode('signup');
    }
  }, []);

  const validatePassword = (
    pw: string
  ): { valid: boolean; message: string } => {
    if (pw.length < 8)
      return {
        valid: false,
        message: 'Password must be at least 8 characters',
      };

    if (pw.length > 128)
      return {
        valid: false,
        message: 'Password must be at most 128 characters',
      };

    if (!/[A-Z]/.test(pw))
      return {
        valid: false,
        message: 'Password must contain at least one uppercase letter',
      };

    if (!/[a-z]/.test(pw))
      return {
        valid: false,
        message: 'Password must contain at least one lowercase letter',
      };

    if (!/[0-9]/.test(pw))
      return {
        valid: false,
        message: 'Password must contain at least one number',
      };

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(pw))
      return {
        valid: false,
        message: 'Password must contain at least one special character',
      };

    return { valid: true, message: '' };
  };

  const validateReferralCode = async (
    code: string
  ): Promise<{ valid: boolean; message: string }> => {
    if (!code) return { valid: true, message: '' };

    try {
      const { data, error } = await supabase.rpc('check_referral_code', {
        code: code.trim().toUpperCase(),
      });

      if (error) {
        return {
          valid: false,
          message: 'Error validating referral code',
        };
      }

      if (data === true) return { valid: true, message: '' };

      return {
        valid: false,
        message: `Invalid referral code: "${code}". Please check and try again.`,
      };
    } catch {
      return {
        valid: false,
        message: 'Error validating referral code. Please try again.',
      };
    }
  };

  const sendWelcomeNotification = async () => {
    try {
      const { data, error } = await supabase.functions.invoke(
        'manage-user-notification',
        {
          body: { action: 'welcome' },
        }
      );

      if (error || !data?.success) return false;

      return true;
    } catch {
      return false;
    }
  };

  const signInWithServerRateLimit = async (
    loginEmail: string,
    loginPassword: string
  ) => {
    const res =
      await callPublicEdgeFunction<LoginRateLimitResponse>(
        'login-with-rate-limit',
        {
          identifier: loginEmail,
          password: loginPassword,
        }
      );

    if (
      !res?.success ||
      !res?.session?.access_token ||
      !res?.session?.refresh_token
    ) {
      throw new Error(res?.error || 'Invalid login credentials.');
    }

    const { data: sessionData, error: sessionError } =
      await supabase.auth.setSession({
        access_token: res.session.access_token,
        refresh_token: res.session.refresh_token,
      });

    if (sessionError || !sessionData.user) {
      throw new Error(
        sessionError?.message || 'Unable to establish your session.'
      );
    }

    return {
      user: sessionData.user,
    };
  };

  const finalizeVerifiedSession = async (
    signedInUser: { id: string; email?: string | null },
    loginEmail: string,
    options?: {
      onPostVerifySuccess?: (userId: string) => Promise<void> | void;
      fallbackSignInMessage?: string;
    }
  ): Promise<boolean> => {
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_verified, is_frozen')
      .eq('id', signedInUser.id)
      .maybeSingle();

    if (profile?.is_frozen) {
      await supabase.auth.signOut({ scope: 'local' });
      clearSupabaseClientStorage({ includeAccountKeys: true });
      clearAuthFlowStorage();
      setMode('signin');
      clearSensitiveFields();

      setErrorMessage(
        'This account is currently frozen. Please contact support at vevupaysecurity@gmail.com to unfreeze it.'
      );

      return false;
    }

    if (profileErr || profile?.is_verified === false) {
      await supabase.auth.signOut({ scope: 'local' });
      clearSupabaseClientStorage({ includeAccountKeys: false });

      setEmail(loginEmail);
      clearSensitiveFields();
      setMode('signup-unverified');

      setErrorMessage(
        options?.fallbackSignInMessage ||
          'Please verify your email address to continue.'
      );

      return false;
    }

    saveBiometricPref(loginEmail);

    if (options?.onPostVerifySuccess) {
      await options.onPostVerifySuccess(signedInUser.id);
    }

    clearSensitiveFields();

    return true;
  };

  const finalizeVerifiedSignIn = async (
    loginEmail: string,
    loginPassword: string,
    options?: {
      onPostVerifySuccess?: (userId: string) => Promise<void> | void;
      fallbackSignInMessage?: string;
    }
  ): Promise<boolean> => {
    const loginResult = await signInWithServerRateLimit(
      loginEmail,
      loginPassword
    );

    return finalizeVerifiedSession(loginResult.user, loginEmail, options);
  };

  const handleBiometricSignIn = async () => {
    if (busy || biometricBusy) return;

    setErrorMessage(null);

    const savedPref = readSavedBiometricPref();
    const targetEmail = (email || savedPref?.email || '').trim().toLowerCase();
    const targetDeviceId = (savedPref?.deviceId || getStoredDeviceId()).trim();

    if (!targetEmail) {
      setErrorMessage(
        'Enter your email address first to sign in with biometrics.'
      );
      return;
    }

    if (!targetDeviceId) {
      setErrorMessage(
        'No enrolled device ID found on this device. Sign in with email and password first.'
      );
      return;
    }

    setBiometricBusy(true);

    try {
      const challengeRes =
        await callPublicEdgeFunction<BiometricChallengeResponse>(
          'biometric-login',
          {
            action: 'create_challenge',
            email: targetEmail,
            device_id: targetDeviceId,
          }
        );

      if (
        !challengeRes?.success ||
        !challengeRes?.challenge_id ||
        !challengeRes?.challenge ||
        !challengeRes?.signed_message
      ) {
        throw new Error(
          challengeRes?.error || 'Could not start biometric sign-in.'
        );
      }

      const signature = await signBiometricLoginChallenge({
        email: targetEmail,
        deviceId: targetDeviceId,
        challengeId: challengeRes.challenge_id,
        challenge: challengeRes.challenge,
        signedMessage: challengeRes.signed_message,
      });

      const verifyRes =
        await callPublicEdgeFunction<BiometricVerifyResponse>(
          'biometric-login',
          {
            action: 'verify_and_login',
            email: targetEmail,
            device_id: targetDeviceId,
            challenge_id: challengeRes.challenge_id,
            challenge: challengeRes.challenge,
            signature,
          }
        );

      if (
        !verifyRes?.success ||
        !verifyRes?.email ||
        !verifyRes?.email_otp
      ) {
        throw new Error(
          verifyRes?.error || 'Biometric sign-in verification failed.'
        );
      }

      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email: verifyRes.email,
        token: verifyRes.email_otp,
        type: 'email',
      });

      if (otpError || !otpData.user) {
        throw new Error(
          otpError?.message || 'Unable to establish your session.'
        );
      }

      saveBiometricPref(verifyRes.email, targetDeviceId);

      const loggedIn = await finalizeVerifiedSession(
        otpData.user,
        verifyRes.email,
        {
          fallbackSignInMessage:
            'Please verify your email address to continue.',
        }
      );

      if (!loggedIn) {
        return;
      }

      toast.success('Signed in with biometrics!');
      navigate({ to: '/dashboard', replace: true });
    } catch (err: any) {
      setErrorMessage(
        getSafeAuthError(err, 'Biometric sign-in failed. Please try again.')
      );
    } finally {
      setBiometricBusy(false);
    }
  };

  const handleTriggerSignupOTP = async (signupEmail: string) => {
    const normalizedEmail = signupEmail.trim().toLowerCase();
    const normalizedReferralCode = referralCode.trim().toUpperCase();

    const res = await callPublicEdgeFunction<{
      success: boolean;
      error?: string;
    }>('send-otp', {
      email: normalizedEmail,
      purpose: 'signup_verification',
    });

    if (!res.success) {
      throw new Error(res.error || 'Failed to send verification code');
    }

    localStorage.setItem(
      'vevupay_pending_signup',
      JSON.stringify({
        email: normalizedEmail,
        expiry: Date.now() + 10 * 60 * 1000,
        referralCode: normalizedReferralCode,
      })
    );

    setSignupOtp('');
    setErrorMessage(null);
    startResendCountdown();
    setMode('signup-otp');

    toast.success('Verification code sent to your email!');
  };

  const handleVerifySignupOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;

    setErrorMessage(null);

    if (signupOtp.length !== 6) {
      setErrorMessage('Enter the complete 6-digit verification code.');
      return;
    }

    setBusy(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const codeToVerify = signupOtp.trim();

      const verification = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('verify-otp', {
        email: normalizedEmail,
        otpCode: codeToVerify,
        purpose: 'signup_verification',
      });

      const alreadyUsedMsg =
        typeof verification?.error === 'string' &&
        verification.error.toLowerCase().includes('already') &&
        verification.error.toLowerCase().includes('used');

      if (!verification?.success && !alreadyUsedMsg) {
        throw new Error(
          verification?.error || 'Invalid or expired code'
        );
      }

      clearAuthFlowStorage();
      setSignupOtp('');
      setResendSeconds(0);

      if (password) {
        try {
          const loggedIn = await finalizeVerifiedSignIn(
            normalizedEmail,
            password,
            {
              onPostVerifySuccess: async () => {
                await sendWelcomeNotification();
              },
            }
          );

          if (loggedIn) {
            toast.success(
              'Email verified! Your VevuPay account is ready.'
            );

            navigate({ to: '/dashboard', replace: true });
          }

          return;
        } catch (postVerifyErr: any) {
          setMode('signin');
          clearSensitiveFields();

          toast.success('Email verified! Please sign in to continue.');

          setErrorMessage(
            getSafeAuthError(
              postVerifyErr,
              'Email verified. Please sign in with your password.'
            )
          );

          return;
        }
      }

      setMode('signin');
      clearSensitiveFields();

      toast.success(
        'Email verified! Please sign in with your password.'
      );
    } catch (err: any) {
      setSignupOtp('');

      setErrorMessage(
        getSafeAuthError(err, 'Verification failed. Please try again.')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResendSignupOTP = async () => {
    if (busy || resendSeconds > 0) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      await handleTriggerSignupOTP(email.trim().toLowerCase());
    } catch (err: any) {
      setErrorMessage(
        getSafeAuthError(err, 'Could not resend verification code')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      const normalizedEmail = forgotEmail.trim().toLowerCase();

      const res = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('send-otp', {
        email: normalizedEmail,
        purpose: 'password_reset',
      });

      if (!res.success) {
        throw new Error(
          res.error || 'Unable to process request right now.'
        );
      }

      setForgotEmail(normalizedEmail);
      setOtpCode('');
      setErrorMessage(null);
      startResendCountdown();

      toast.success(
        'If an account matches that email, a verification code has been sent.'
      );

      setMode('otp-verify');
    } catch (err: any) {
      setErrorMessage(
        getSafeAuthError(
          err,
          'If an account matches that email, a verification code has been sent.'
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResendPasswordOTP = async () => {
    if (busy || resendSeconds > 0) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      const res = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('send-otp', {
        email: forgotEmail.trim().toLowerCase(),
        purpose: 'password_reset',
      });

      if (!res.success) {
        throw new Error(
          res.error || 'Could not resend verification code'
        );
      }

      setOtpCode('');
      startResendCountdown();

      toast.success(
        'If an account matches that email, a new verification code has been sent.'
      );
    } catch (err: any) {
      setErrorMessage(
        getSafeAuthError(err, 'Could not resend verification code')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      const res = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('verify-otp', {
        email: forgotEmail.trim().toLowerCase(),
        otpCode: otpCode.trim(),
        purpose: 'password_reset',
      });

      if (!res.success) {
        throw new Error(res.error || 'Invalid code');
      }

      toast.success('Code verified! Please set a new password.');
      setMode('reset-password');
    } catch (err: any) {
      setOtpCode('');
      setErrorMessage(getSafeAuthError(err, 'Invalid or expired code'));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      const pwValidation = validatePassword(newPassword);

      if (!pwValidation.valid) {
        setErrorMessage(pwValidation.message);
        return;
      }

      const res = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('reset-password-with-otp', {
        email: forgotEmail.trim().toLowerCase(),
        newPassword,
        otpCode: otpCode.trim(),
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to reset password');
      }

      toast.success('Password reset successful! Please sign in.');

      setMode('signin');
      clearSensitiveFields();
      setForgotEmail('');
      setResendSeconds(0);
      clearAuthFlowStorage();
    } catch (err: any) {
      setErrorMessage(
        getSafeAuthError(err, 'Failed to reset password')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignInOrSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (busy || biometricBusy) return;

    setErrorMessage(null);
    setBusy(true);

    try {
      if (mode === 'signup') {
        if (!agreedToTerms) {
          setErrorMessage('You must agree to the Terms.');
          return;
        }

        if (!firstName.trim() || !lastName.trim()) {
          setErrorMessage('First name and last name are required');
          return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
          setErrorMessage('Enter a valid email address.');
          return;
        }

        const pwValidation = validatePassword(password);

        if (!pwValidation.valid) {
          setErrorMessage(pwValidation.message);
          return;
        }

        const normalizedReferralCode = referralCode.trim().toUpperCase();

        if (normalizedReferralCode) {
          const validation = await validateReferralCode(
            normalizedReferralCode
          );

          if (!validation.valid) {
            setErrorMessage(validation.message);
            return;
          }
        }

        const result = await signUp(
          normalizedEmail,
          password,
          firstName.trim(),
          middleName.trim(),
          lastName.trim(),
          '',
          undefined,
          normalizedReferralCode || undefined
        );

        if (result.error) {
          throw result.error;
        }

        if (!result.user) {
          throw new Error(
            'Account creation failed. Please try again.'
          );
        }

        await supabase.auth.signOut({ scope: 'local' });
        clearSupabaseClientStorage({ includeAccountKeys: false });

        setEmail(normalizedEmail);
        setReferralCode(normalizedReferralCode);
        setMode('signup-unverified');
      } else {
        if (!email || !password) {
          setErrorMessage('Email and password required');
          return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        const loggedIn = await finalizeVerifiedSignIn(
          normalizedEmail,
          password,
          {
            fallbackSignInMessage:
              'Please verify your email address to continue.',
          }
        );

        if (!loggedIn) {
          return;
        }

        toast.success('Welcome back!');

        navigate({ to: '/dashboard', replace: true });
      }
    } catch (err: any) {
      setPassword('');
      setErrorMessage(
        getSafeAuthError(err, 'Authentication failed')
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnauthSupportSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (
      !supportEmail ||
      !supportEmail.includes('@') ||
      !supportMessage.trim()
    ) {
      toast.error(
        'Please enter a valid email address and describe your issue.'
      );

      return;
    }

    setSupportSubmitting(true);

    try {
      const res = await callPublicEdgeFunction<{
        success: boolean;
        error?: string;
      }>('unauth-support', {
        email: supportEmail.trim().toLowerCase(),
        message: supportMessage.trim(),
        type: mode,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to submit report');
      }

      setSupportMessage('');
      setSupportSubmitted(true);

      toast.success('Support report sent successfully!');
    } catch (err: any) {
      toast.error(
        getSafeAuthError(err, 'Failed to submit report')
      );
    } finally {
      setSupportSubmitting(false);
    }
  };

  const SpamNotice = () => (
    <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-center">
      <p className="text-sm font-bold text-foreground">
        Didn't receive it? Check Your Spam folder.
      </p>

      <p className="mt-1 text-xs text-muted-foreground">
        Sometimes verification emails are filtered into Spam or Junk.
      </p>
    </div>
  );

  const ResendButton = ({
    onClick,
    label = 'Resend email',
  }: {
    onClick: () => void;
    label?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || biometricBusy || resendSeconds > 0}
      className="w-full rounded-lg py-2 text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Sending email...
        </span>
      ) : resendSeconds > 0 ? (
        `Resend email in ${formatCountdown()}`
      ) : (
        label
      )}
    </button>
  );

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative hidden overflow-hidden bg-brand-gradient p-10 lg:flex lg:flex-col lg:justify-between">
          <div className="relative">
            <Logo size={44} withWordmark />
          </div>

          <div className="relative z-10 space-y-3 text-primary-foreground">
            <h2 className="text-4xl font-bold leading-tight">
              Vevu Pay — The everyday wallet for bills, airtime, data &amp;
              rewards.
            </h2>

            <p className="text-sm text-primary-foreground/85">
              Pay electricity and cable TV bills, buy mobile data and airtime,
              get exam pins, and manage your VevuPay wallet in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Logo size={40} withWordmark />
            </div>

            <div className="surface p-6 sm:p-8">
              <h1 className="text-2xl font-bold tracking-tight">
                {mode === 'signin'
                  ? 'Sign in to Vevu Pay'
                  : mode === 'signup'
                    ? 'Create Vevu Pay account'
                    : mode === 'signup-unverified'
                      ? 'Account Not Verified'
                      : mode === 'signup-otp'
                        ? 'Verify your email'
                        : mode === 'forgot-password'
                          ? 'Reset Password'
                          : mode === 'otp-verify'
                            ? 'Verify your email'
                            : 'Create new password'}
              </h1>

              {(mode === 'signin' || mode === 'signup') && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {mode === 'signin'
                    ? 'Sign in to your VevuPay wallet to buy airtime, data, bills, and exam pins.'
                    : 'Join Vevu Pay to pay bills, top up airtime & data, and earn rewards.'}
                </p>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-destructive/20 bg-destructive/15 p-3 text-sm text-destructive"
                >
                  {errorMessage}
                </div>
              )}

              {(mode === 'signin' || mode === 'signup') && (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signin');
                        clearSensitiveFields();
                        setErrorMessage(null);
                      }}
                      className={`rounded-full py-2 text-xs font-semibold transition ${
                        mode === 'signin'
                          ? 'bg-card text-foreground shadow'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Sign in
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        clearSensitiveFields();
                        setErrorMessage(null);
                      }}
                      className={`rounded-full py-2 text-xs font-semibold transition ${
                        mode === 'signup'
                          ? 'bg-card text-foreground shadow'
                          : 'text-muted-foreground'
                      }`}
                    >
                      Sign up
                    </button>
                  </div>

                  <form
                    onSubmit={handleSignInOrSignUp}
                    autoComplete="off"
                    className="mt-5 space-y-3.5"
                  >
                    {mode === 'signup' && (
                      <>
                        <input
                          required
                          type="text"
                          autoComplete="off"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="input-field"
                          placeholder="First Name"
                        />

                        <input
                          type="text"
                          autoComplete="off"
                          value={middleName}
                          onChange={(e) => setMiddleName(e.target.value)}
                          className="input-field"
                          placeholder="Middle Name (optional)"
                        />

                        <input
                          required
                          type="text"
                          autoComplete="off"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="input-field"
                          placeholder="Last Name"
                        />

                        <input
                          type="text"
                          autoComplete="off"
                          value={referralCode}
                          onChange={(e) =>
                            setReferralCode(e.target.value.toUpperCase())
                          }
                          className="input-field"
                          placeholder="Referral code (optional)"
                        />
                      </>
                    )}

                    <input
                      required
                      type="email"
                      autoComplete="off"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field"
                      placeholder="Email address"
                    />

                    <div className="relative">
                      <input
                        required
                        type={showPw ? 'text' : 'password'}
                        autoComplete={
                          mode === 'signup' ? 'new-password' : 'off'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input-field pr-10"
                        placeholder="Password"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPw ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {mode === 'signin' && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSupportEmail(email || '');
                            setShowSupportModal(true);
                          }}
                          className="flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-primary"
                        >
                          <LifeBuoy className="h-3.5 w-3.5" />
                          Having trouble signing in?
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot-password');
                            clearSensitiveFields();
                            setErrorMessage(null);
                          }}
                          className="font-semibold text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                    )}

                    {mode === 'signup' && (
                      <>
                        <div className="flex items-start gap-2.5 py-1">
                          <input
                            type="checkbox"
                            id="terms"
                            checked={agreedToTerms}
                            onChange={(e) =>
                              setAgreedToTerms(e.target.checked)
                            }
                            style={{
                              accentColor: 'hsl(var(--primary))',
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border"
                          />

                          <div className="text-xs leading-relaxed text-muted-foreground">
                            I agree to the{' '}
                            <button
                              type="button"
                              onClick={() => setLegalSlug('terms')}
                              className="font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              Terms &amp; Conditions
                            </button>
                            {' '}and{' '}
                            <button
                              type="button"
                              onClick={() =>
                                setLegalSlug('privacy-policy')
                              }
                              className="font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              Privacy Policy
                            </button>
                            .
                          </div>
                        </div>

                        <div className="pt-1 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSupportEmail('');
                              setShowSupportModal(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
                          >
                            <LifeBuoy className="h-3.5 w-3.5" />
                            Having trouble signing up? Contact support
                          </button>
                        </div>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={busy || biometricBusy}
                      className="btn-primary mt-2 w-full py-3 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : mode === 'signin' ? (
                        'Sign In'
                      ) : (
                        'Create Account'
                      )}
                    </button>

                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={handleBiometricSignIn}
                        disabled={busy || biometricBusy}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 py-3 text-sm font-semibold text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {biometricBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Fingerprint className="h-4 w-4 text-primary" />
                        )}
                        <span>
                          {biometricBusy
                            ? 'Verifying biometrics...'
                            : 'Sign in with fingerprint'}
                        </span>
                      </button>
                    )}
                  </form>
                </>
              )}

              {mode === 'signup-unverified' && (
                <div className="mt-5 space-y-4 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                    <ShieldAlert className="h-6 w-6" />
                  </div>

                  <p className="text-sm text-muted-foreground">
                    You haven&apos;t verified your account yet. Please verify
                    your email address (<strong>{email}</strong>) to access
                    your wallet and features.
                  </p>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (busy) return;

                      setBusy(true);

                      try {
                        await handleTriggerSignupOTP(
                          email.trim().toLowerCase()
                        );
                      } catch (err: any) {
                        setErrorMessage(
                          getSafeAuthError(
                            err,
                            'Failed to send verification code'
                          )
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Verify First (Send Code)'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      clearSensitiveFields();
                      setErrorMessage(null);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}

              {mode === 'signup-otp' && (
                <form
                  onSubmit={handleVerifySignupOTP}
                  autoComplete="off"
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    We sent a 6-digit verification code to{' '}
                    <strong>{email}</strong>. Enter the code below to activate
                    your VevuPay account.
                  </p>

                  <SpamNotice />

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={signupOtp}
                      onChange={(e) =>
                        setSignupOtp(e.target.value.replace(/\D/g, ''))
                      }
                      className="input-field pl-10 text-center text-lg tracking-widest"
                      placeholder="000000"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy || signupOtp.length !== 6}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Verify Email & Continue'
                    )}
                  </button>

                  <ResendButton onClick={handleResendSignupOTP} />

                  <button
                    type="button"
                    onClick={() => {
                      clearAuthFlowStorage();
                      setMode('signup');
                      clearSensitiveFields();
                      setErrorMessage(null);
                      setResendSeconds(0);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign Up
                  </button>
                </form>
              )}

              {mode === 'forgot-password' && (
                <form
                  onSubmit={handleSendOTP}
                  autoComplete="off"
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    Enter your email address and we&apos;ll send you a 6-digit
                    verification code if an account matches.
                  </p>

                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      required
                      type="email"
                      autoComplete="off"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="input-field pl-10"
                      placeholder="you@example.com"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Send Verification Code'
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin');
                      clearSensitiveFields();
                      setErrorMessage(null);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                  >
                    Back to Sign In
                  </button>
                </form>
              )}

              {mode === 'otp-verify' && (
                <form
                  onSubmit={handleVerifyOTP}
                  autoComplete="off"
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    If an account matches <strong>{forgotEmail}</strong>, a
                    6-digit code was sent. Enter it below.
                  </p>

                  <SpamNotice />

                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      required
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) =>
                        setOtpCode(e.target.value.replace(/\D/g, ''))
                      }
                      className="input-field pl-10 text-center text-lg tracking-widest"
                      placeholder="000000"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy || otpCode.length !== 6}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Verify Code'
                    )}
                  </button>

                  <ResendButton onClick={handleResendPasswordOTP} />

                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot-password');
                      setOtpCode('');
                      setResendSeconds(0);
                      clearAuthFlowStorage();
                      setErrorMessage(null);
                    }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground"
                  >
                    Change email address
                  </button>
                </form>
              )}

              {mode === 'reset-password' && (
                <form
                  onSubmit={handleResetPassword}
                  autoComplete="off"
                  className="mt-5 space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    Code verified! Please enter your new password.
                  </p>

                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                    <input
                      required
                      type={showNewPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field pl-10 pr-10"
                      placeholder="New Password"
                    />

                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      aria-label={
                        showNewPw ? 'Hide new password' : 'Show new password'
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

                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary w-full py-3 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    ) : (
                      'Update Password'
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSupportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report login or signup issue"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                Report Login / Signup Issue
              </h3>

              <button
                type="button"
                onClick={() => {
                  setShowSupportModal(false);
                  setSupportSubmitted(false);
                }}
                aria-label="Close support modal"
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {supportSubmitted ? (
              <div className="space-y-3 py-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10 text-xl font-bold text-green-500">
                  ✓
                </div>

                <h4 className="font-bold text-foreground">
                  Report Received
                </h4>

                <p className="text-sm text-muted-foreground">
                  We’ve received your message and sent a confirmation email
                  to your inbox. We’ll get back to you soon.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setShowSupportModal(false);
                    setSupportSubmitted(false);
                  }}
                  className="mt-4 w-full rounded-xl bg-primary py-2.5 font-semibold text-primary-foreground shadow-md"
                >
                  Close
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleUnauthSupportSubmit}
                className="space-y-4"
              >
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Your Email Address
                  </label>

                  <input
                    type="email"
                    required
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-xl border border-border bg-secondary p-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Describe the problem
                  </label>

                  <textarea
                    required
                    rows={4}
                    value={supportMessage}
                    onChange={(e) => setSupportMessage(e.target.value)}
                    placeholder="What error are you experiencing?"
                    className="w-full resize-none rounded-xl border border-border bg-secondary p-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="submit"
                  disabled={supportSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {supportSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Submit Report'
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {legalSlug && (
        <LegalModal
          slug={legalSlug}
          onClose={() => setLegalSlug(null)}
        />
      )}
    </div>
  );
}

export default AuthPage;
