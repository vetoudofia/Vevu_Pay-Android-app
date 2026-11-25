import { Capacitor, registerPlugin } from "@capacitor/core";

export interface BiometricKeyInfo {
  publicKeySpki: string;
  attestationCertificates: string[];
  securityLevel: "STRONGBOX" | "TEE" | "SOFTWARE" | "UNKNOWN";
}

export interface BiometricSignature {
  signature: string;
}

interface VevuPayBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; strongBiometry: boolean; reason?: string }>;
  createKey(options: { attestationChallenge: string }): Promise<BiometricKeyInfo>;
  sign(options: { message: string; promptTitle: string; promptSubtitle: string }): Promise<BiometricSignature>;
  deleteKey(): Promise<{ deleted: boolean }>;
}

const NativeBiometric = registerPlugin<VevuPayBiometricPlugin>("VevuPayBiometric");

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export async function checkNativeBiometric() {
  if (!isNativeAndroid()) {
    return { available: false, strongBiometry: false, reason: "Fingerprint authentication is available in the Android app only." };
  }
  return NativeBiometric.isAvailable();
}

export async function createNativeBiometricKey(attestationChallenge: string) {
  if (!isNativeAndroid()) throw new Error("Open VevuPay on your Android device to enable fingerprint authentication.");
  return NativeBiometric.createKey({ attestationChallenge });
}

export async function signWithNativeBiometric(message: string) {
  if (!isNativeAndroid()) throw new Error("Fingerprint signing is available in the Android app only.");
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
