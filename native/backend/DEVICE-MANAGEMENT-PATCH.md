# Required patch to the supplied device-management Edge Function

The `issueKeyChallenge()` response currently omits the database device UUID, but `enrollPublicKey()` requires that UUID in the exact signed message. Add the following field to its returned object:

```ts
return {
  success: true,
  challenge_id: data.id,
  challenge,
  device_record_id: device.id,
  expires_at: data.expires_at,
};
```

This resolves the signed-message construction gap. It does **not** complete biometric enrollment security.

Before accepting a public key for financial transactions, `enrollPublicKey()` must also receive and verify the Android Key Attestation certificate chain. The current function does not do this and intentionally stores the key with `biometric_transactions_enabled: false`. Do not change that flag to `true` merely because proof-of-possession succeeds. A trusted server-side attestation verifier must validate the certificate chain and Android attestation extension, then atomically set the verified attestation columns and enable transaction biometrics.

The client-side preparation function is `src/native/biometric-enrollment.ts`. It deliberately stops after producing the public key, certificate chain and proof-of-possession signature; it does not send them to the current non-attestation-verifying enrollment action.
