// src/hooks/use-auth.tsx
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearSupabaseClientStorage, supabase } from "@/lib/supabase";
import { User, Session } from "@supabase/supabase-js";

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  ipAddress?: string;
  userAgent: string;
  lastUsed: string;
  isTrusted: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;

  signIn: (
    email: string,
    password: string
  ) => Promise<{
    error?: any;
    user?: User;
  }>;

  signUp: (
    email: string,
    password: string,
    firstName: string,
    middleName: string,
    lastName: string,
    phone?: string,
    signupIP?: string,
    referralCode?: string
  ) => Promise<{ error?: any; user?: User }>;

  registerDevice: (deviceInfo: DeviceInfo) => Promise<void>;
  isKnownDevice: (deviceId: string) => Promise<boolean>;
  getDevices: () => Promise<DeviceInfo[]>;
  removeDevice: (deviceId: string) => Promise<void>;

  changePassword: (
    oldPassword: string,
    newPassword: string,
    verificationMethod?: "email_otp",
    verificationCode?: string
  ) => Promise<{
    requiresVerification: boolean;
    method?: string;
  }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Prevent signup sessions from being treated as authenticated sessions
  // before the custom signup OTP has been verified.
  const pendingSignupRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (pendingSignupRef.current) {
          setSession(null);
          setUser(null);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (!mounted) return;

      if (pendingSignupRef.current) {
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        queryClient.clear();
        clearSupabaseClientStorage({ includeAccountKeys: true });
        setSession(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // ─── SIGN UP ─────────────────────────────────────────────

  const signUp = async (
    email: string,
    password: string,
    firstName: string,
    middleName: string,
    lastName: string,
    phone?: string,
    signupIP?: string,
    referralCode?: string
  ) => {
    try {
      if (!email || !password || !firstName || !lastName) {
        return {
          error: new Error(
            "First name, last name, email, and password are required"
          ),
        };
      }

      if (password.length < 6) {
        return {
          error: new Error("Password must be at least 6 characters"),
        };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPhone = phone?.trim() || null;

      const normalizedReferralCode =
        referralCode?.trim().toUpperCase() || null;

      const fullName = `${firstName.trim()} ${
        middleName ? middleName.trim() + " " : ""
      }${lastName.trim()}`.trim();

      const termsAcceptedAt = new Date().toISOString();

      // Block auth-state changes while creating an unverified account.
      pendingSignupRef.current = true;

      // Ensure any prior session is cleared before starting signup.
      await supabase.auth.signOut({ scope: "local" });
      queryClient.clear();
      clearSupabaseClientStorage({ includeAccountKeys: true });

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: password.trim(),
        options: {
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            middle_name: middleName?.trim() || null,
            last_name: lastName.trim(),
            phone: normalizedPhone,
            signup_ip: signupIP || null,

            // Backend handle_new_user() validates this code
            // and resolves the referrer's profile ID.
            referral_code: normalizedReferralCode,

            terms_accepted_at: termsAcceptedAt,
            terms_version: 1,
          },
        },
      });

      if (error) {
        return { error };
      }

      if (!data.user) {
        return {
          error: new Error("Failed to create account"),
        };
      }

      // The database trigger handle_new_user() creates the profile automatically.
      // Do not insert or upsert profiles here while awaiting OTP verification.
      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
        clearSupabaseClientStorage({ includeAccountKeys: false });
      }

      return { user: data.user };
    } catch (error: any) {
      return { error };
    } finally {
      pendingSignupRef.current = false;
      setUser(null);
      setSession(null);
    }
  };

  // ─── SIGN IN ─────────────────────────────────────────────

  const signIn = async (email: string, password: string) => {
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      clearSupabaseClientStorage({ includeAccountKeys: true });

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (error) return { error };

      if (!data.user || !data.session) {
        return {
          error: new Error("Login failed"),
        };
      }

      setUser(data.user);
      setSession(data.session);

      return { user: data.user };
    } catch (error: any) {
      return { error };
    }
  };

  // ─── CHANGE PASSWORD: EMAIL OTP REQUIRED ─────────────────

  const changePassword = async (
    oldPassword: string,
    newPassword: string,
    verificationMethod?: "email_otp",
    verificationCode?: string
  ): Promise<{
    requiresVerification: boolean;
    method?: string;
  }> => {
    if (!user?.email) {
      throw new Error("No user logged in");
    }

    if (!oldPassword) {
      throw new Error("Current password is required");
    }

    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    try {
      // First stage: send email OTP.
      if (!verificationCode || verificationMethod !== "email_otp") {
        const { data, error } = await supabase.functions.invoke("send-otp", {
          body: {
            purpose: "password_change",
          },
        });

        if (error) throw error;

        if (data?.success === false) {
          throw new Error(
            data.message || "Failed to send verification code"
          );
        }

        return {
          requiresVerification: true,
          method: "email_otp",
        };
      }

      // Final stage: verify current password + OTP and change password server-side.
      const { data: changeData, error: changeError } =
        await supabase.functions.invoke("secure-password-change", {
          body: {
            currentPassword: oldPassword,
            newPassword,
            otpCode: verificationCode.trim(),
          },
        });

      if (changeError) throw changeError;

      if (changeData?.success === false) {
        throw new Error(changeData.message || "Password change failed");
      }

      return {
        requiresVerification: false,
      };
    } catch (error: any) {
      throw new Error(error?.message || "Failed to change password");
    }
  };

  // ─── DEVICE MANAGEMENT ────────────────────────────────────

  const registerDevice = async (deviceInfo: DeviceInfo) => {
    if (!user) return;

    await supabase.from("user_devices").upsert(
      {
        user_id: user.id,
        device_id: deviceInfo.deviceId,
        device_name: deviceInfo.deviceName || navigator.userAgent,
        ip_address: deviceInfo.ipAddress || "unknown",
        user_agent: deviceInfo.userAgent || navigator.userAgent,
        last_used: new Date().toISOString(),
        is_trusted: true,
      },
      {
        onConflict: "user_id, device_id",
      }
    );
  };

  const isKnownDevice = async (deviceId: string): Promise<boolean> => {
    if (!user) return false;

    const { data } = await supabase
      .from("user_devices")
      .select("id")
      .eq("user_id", user.id)
      .eq("device_id", deviceId)
      .maybeSingle();

    return !!data;
  };

  const getDevices = async (): Promise<DeviceInfo[]> => {
    if (!user) return [];

    const { data, error } = await supabase
      .from("user_devices")
      .select("*")
      .eq("user_id", user.id)
      .order("last_used", { ascending: false });

    if (error || !data) return [];

    return data.map((d) => ({
      deviceId: d.device_id,
      deviceName: d.device_name,
      ipAddress: d.ip_address,
      userAgent: d.user_agent,
      lastUsed: d.last_used,
      isTrusted: d.is_trusted,
    }));
  };

  const removeDevice = async (deviceId: string) => {
    if (!user) return;

    await supabase
      .from("user_devices")
      .delete()
      .eq("user_id", user.id)
      .eq("device_id", deviceId);
  };

  // ─── SIGN OUT ─────────────────────────────────────────────

  const signOut = async () => {
    try {
      await queryClient.cancelQueries();
      await supabase.auth.signOut({ scope: "local" });
    } finally {
      queryClient.clear();
      clearSupabaseClientStorage({ includeAccountKeys: true });
      setUser(null);
      setSession(null);
    }
  };

  const refreshUser = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    setUser(user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        signOut,
        refreshUser,
        signIn,
        signUp,
        registerDevice,
        isKnownDevice,
        getDevices,
        removeDevice,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
