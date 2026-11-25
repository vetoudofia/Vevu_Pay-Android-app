# Native Android biometric integration

The web build is unchanged. The Capacitor Android build uses a custom native plugin at:

`native/android/app/src/main/java/com/webapp/vevupay/VevuPayBiometricPlugin.java`

## Generated Android project integration

After running `npx cap add android`:

1. Copy `native/android/app/src/main/java/com/webapp/vevupay/VevuPayBiometricPlugin.java` and `MainActivity.java` into `android/app/src/main/java/com/webapp/vevupay/`.
2. Ensure `android/app/build.gradle` contains `implementation 'androidx.biometric:biometric:1.1.0'` in `dependencies`.
3. Add `<uses-permission android:name="android.permission.USE_BIOMETRIC" />` directly under the root `<manifest>` element in `android/app/src/main/AndroidManifest.xml`.
4. Ensure Android `compileSdk` and `targetSdk` are at least 35 (Capacitor 8 requirement).
5. Run `npx cap sync android` and build on a machine with Android SDK/Gradle installed.

The plugin creates a P-256 EC key in Android Keystore, requires strong biometric authentication for every signature, requests a fresh attestation challenge, returns the SPKI public key and certificate chain, and signs the exact UTF-8 message passed by the app. It never exports the private key.

## Critical server-side release gate

The currently supplied `device-management` Edge Function does **not** accept or verify `attestation_certificates`. Its `enroll_public_key` action verifies proof of private-key possession only, then deliberately leaves `biometric_transactions_enabled = false`. The transaction challenge endpoint additionally requires verified attestation metadata.

Therefore, do not connect enrollment to the live financial authorization flow or enable biometric transactions until a server-side Android Key Attestation verifier validates, at minimum:

- the full certificate chain to a trusted Android attestation root;
- the attestation challenge equals the server-issued challenge;
- the attested public key equals `public_key_spki`;
- `attestationApplicationId` matches the signed VevuPay package and signing certificate;
- `attestationSecurityLevel` is TrustedEnvironment or StrongBox;
- verified boot state is Verified and deviceLocked is true;
- key origin is generated, purpose includes SIGN, digest includes SHA-256, and user authentication is required for each use.

Only after those checks should the server atomically persist verified attestation metadata and set `biometric_transactions_enabled = true`. Until then, the existing transaction PIN must remain available and unchanged. A local fingerprint prompt alone is not transaction authorization.
