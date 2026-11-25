import { supabase } from "@/lib/supabase";
import { createNativeBiometricKey, signWithNativeBiometric } from "@/native/biometric";

export interface PreparedBiometricEnrollment {
  deviceId: string;
  deviceRecordId: string;
  challengeId: string;
  challenge: string;
  publicKeySpki: string;
  attestationCertificates: string[];
  securityLevel: "STRONGBOX" | "TEE" | "SOFTWARE" | "UNKNOWN";
  signature: string;
}

/**
 * Generates enrollment proof and Android Key Attestation material.
 * It intentionally does not call enroll_public_key: the supplied server
 * function does not validate the certificate chain or attestation extension.
 */
export async function prepareBiometricEnrollment(
  deviceId: string,
  currentPassword: string,
): Promise<PreparedBiometricEnrollment> {
  if (!deviceId || !currentPassword) {
    throw new Error("Device registration and current password are required.");
  }

  const { data: challenge, error } = await supabase.functions.invoke(
    "device-management",
    {
      body: {
        action: "issue_key_challenge",
        device_id: deviceId,
        current_password: currentPassword,
      },
    },
  );
  if (error || challenge?.success !== true) {
    throw new Error(challenge?.error || error?.message || "Could not request biometric enrollment.");
  }

  // The current deployed response omits this UUID. The backend must add
  // device_record_id: device.id to issueKeyChallenge() before this can proceed.
  if (typeof challenge.device_record_id !== "string" || !challenge.device_record_id) {
    throw new Error("Biometric enrollment needs a small device-management backend update before it can continue safely.");
  }

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Your session has expired. Sign in again.");

  const key = await createNativeBiometricKey(String(challenge.challenge));
  const signedMessage = [
    "VEVUPAY-DEVICE-KEY-V1",
    String(challenge.challenge_id),
    userId,
    challenge.device_record_id,
    "biometric_enrollment",
    String(challenge.challenge),
  ].join("\n");
  const { signature } = await signWithNativeBiometric(signedMessage);

  return {
    deviceId,
    deviceRecordId: challenge.device_record_id,
    challengeId: String(challenge.challenge_id),
    challenge: String(challenge.challenge),
    publicKeySpki: key.publicKeySpki,
    attestationCertificates: key.attestationCertificates,
    securityLevel: key.securityLevel,
    signature,
  };
}
