import { callEdgeFunction } from "@/lib/supabase";
import { isNativeAndroid, signWithNativeBiometric } from "@/native/biometric";

export interface TransactionBiometricSettings {
  biometric_enabled: boolean;
  biometric_device_id: string | null;
  transaction_biometrics_enabled: boolean;
}

export interface TransactionBiometricAuthorization {
  device_id: string;
  challenge_id: string;
  nonce: string;
  signature: string;
  transaction_payload_hash: string;
}

export async function getTransactionBiometricSettings(): Promise<TransactionBiometricSettings> {
  const result = await callEdgeFunction<any>("device-management", {
    action: "get_biometric_settings",
  });
  const settings = result?.settings ?? result?.data?.settings ?? {};
  return {
    biometric_enabled: settings.biometric_enabled === true,
    biometric_device_id:
      typeof settings.biometric_device_id === "string" ? settings.biometric_device_id : null,
    transaction_biometrics_enabled: settings.transaction_biometrics_enabled === true,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function authorizeTransactionWithBiometric(args: {
  deviceId: string;
  transactionType: "purchase" | "transfer";
  transactionReference: string;
  transactionPayloadHash: string;
}): Promise<TransactionBiometricAuthorization> {
  if (!isNativeAndroid()) {
    throw new Error("Fingerprint transaction authorization is available in the VevuPay Android app only.");
  }

  const challenge = await callEdgeFunction<any>("device-management", {
    action: "create_transaction_challenge",
    device_id: args.deviceId,
    transaction_type: args.transactionType,
    transaction_reference: args.transactionReference,
    transaction_payload_hash: args.transactionPayloadHash,
  });

  if (!challenge?.challenge_id || !challenge?.nonce || !challenge?.signed_message) {
    throw new Error("The server did not return a valid transaction authorization challenge.");
  }

  const signed = await signWithNativeBiometric(challenge.signed_message);
  if (!signed?.signature) {
    throw new Error("Fingerprint authorization was not completed.");
  }

  return {
    device_id: args.deviceId,
    challenge_id: challenge.challenge_id,
    nonce: challenge.nonce,
    signature: signed.signature,
    transaction_payload_hash: args.transactionPayloadHash,
  };
}
