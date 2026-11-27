import { Capacitor, registerPlugin } from "@capacitor/core";

export interface BiometricKeyInfo {
  publicKeySpki: string;
  attestationCertificates: string[];
  securityLevel: "STRONGBOX" | "TEE" | "SOFTWARE" | "UNKNOWN";
}

export interface BiometricSignature {
  signature: string;
}

export interface EnrollBiometricKeyParams {
  challengeId: string;
  challenge: string;
  signedMessage: string;
  deviceId?: string;
}

export interface EnrollBiometricKeyResult {
  publicKeySpki: string;
  signature: string;
  attestationCertificates?: string[];
  securityLevel?: BiometricKeyInfo["securityLevel"];
  algorithm?: string;
}

interface VevuPayBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; strongBiometry: boolean; reason?: string }>;
  createKey(options: { attestationChallenge: string }): Promise<BiometricKeyInfo>;
  sign(options: { message: string; promptTitle: string; promptSubtitle: string }): Promise<BiometricSignature>;
  deleteKey(): Promise<{ deleted: boolean }>;
  getDeviceId?(): Promise<{ deviceId?: string } | string>;
}

const NativeBiometric = registerPlugin<VevuPayBiometricPlugin>("VevuPayBiometric");

const DEVICE_ID_KEYS = ["vevupay_device_id", "device_id"];

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function checkNativeBiometric() {
  if (!isNativeAndroid()) {
    return {
      available: false,
      strongBiometry: false,
      reason: "Fingerprint authentication is available in the Android app only.",
    };
  }
  return NativeBiometric.isAvailable();
}

export async function createNativeBiometricKey(attestationChallenge: string) {
  if (!isNativeAndroid()) {
    throw new Error("Open VevuPay on your Android device to enable fingerprint authentication.");
  }
  return NativeBiometric.createKey({ attestationChallenge });
}

export async function signWithNativeBiometric(message: string) {
  if (!isNativeAndroid()) {
    throw new Error("Fingerprint signing is available in the Android app only.");
  }
  return NativeBiometric.sign({
    message,
    promptTitle: "Authorize with fingerprint",
    promptSubtitle: "Confirm your identity to continue securely.",
  });
}

export async function deleteNativeBiometricKey() {
  if (!isNativeAndroid()) return { deleted: false };
  return NativeBiometric.deleteKey();
}

export async function getNativeDeviceId(): Promise<string> {
  if (typeof window !== "undefined") {
    if (isNativeAndroid() && typeof NativeBiometric.getDeviceId === "function") {
      try {
        const res = await NativeBiometric.getDeviceId();
        const id = typeof res === "string" ? res : res?.deviceId;
        if (id && id.trim()) {
          return id.trim();
        }
      } catch {
        // Fall through to stored device ID
      }
    }

    for (const key of DEVICE_ID_KEYS) {
      try {
        const stored = localStorage.getItem(key);
        if (stored && stored.trim()) {
          return stored.trim();
        }
      } catch {
        // Ignore storage errors
      }
    }
  }

  return "";
}

export async function enrollBiometricKey(
  params: EnrollBiometricKeyParams,
): Promise<EnrollBiometricKeyResult> {
  if (!isNativeAndroid()) {
    throw new Error("Open VevuPay on your Android device to enable fingerprint authentication.");
  }

  const keyInfo = await NativeBiometric.createKey({
    attestationChallenge: params.challenge,
  });

  const signed = await NativeBiometric.sign({
    message: params.signedMessage,
    promptTitle: "Confirm biometric key",
    promptSubtitle: "Verify your fingerprint to enroll this device key.",
  });

  return {
    publicKeySpki: keyInfo.publicKeySpki,
    signature: signed.signature,
    attestationCertificates: keyInfo.attestationCertificates,
    securityLevel: keyInfo.securityLevel,
    algorithm: "ECDSA_P256_SHA256",
  };
}

export async function signBiometricMessage(signedMessage: string): Promise<string> {
  const signed = await signWithNativeBiometric(signedMessage);
  return signed.signature;
}
