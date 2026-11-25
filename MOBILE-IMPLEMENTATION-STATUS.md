# VevuPay Android mobile project status

## Included in this source package

- The existing VevuPay React/TanStack application remains the shared application source; the website build remains on its original Vite/TanStack Start configuration.
- A separate client-only Capacitor Vite entry (`mobile/`, `vite.mobile.config.ts`) builds the same application for the Android WebView.
- Capacitor 8 dependencies and Android app identity `com.webapp.vevupay`.
- Native lifecycle integration for Android back navigation, status bar, splash screen and push-notification routing.
- Android device registration and Firebase Cloud Messaging token registration through the existing `device-management` Edge Function.
- Native Android Keystore P-256 key-generation/signing plugin source (`native/android/`) and TypeScript bridge (`src/native/biometric.ts`). The key is configured for strong biometric authentication on each signing operation; private key material never leaves Android Keystore.
- Biometric enrollment preparation (`src/native/biometric-enrollment.ts`) which obtains the server challenge, generates the key, gathers the Android attestation chain and signs the server's enrollment message. It deliberately stops before submitting the key because the currently supplied backend does not verify Android attestation.
- Android integration and backend release-gate documentation in `native/`.
- Existing transaction PIN/password interface and logic in `src/routes/_authenticated/security.tsx` are preserved. `src/routes/_authenticated/pin.tsx` remains a compatibility redirect to Security Settings; no duplicate PIN screen was introduced.
- Android safe-area and bottom-navigation refinements, app icon/splash assets, Play listing icon, feature graphic and draft listing copy.

## Not complete — do not treat this source package as a release build

- The Android project has not been generated (`android/` is absent). Generate it with `npx cap add android`, then follow `native/ANDROID-BIOMETRIC-INTEGRATION.md` to add the custom plugin and AndroidX Biometric dependency.
- No APK or AAB has been built, signed or device-tested in this environment. This runtime has no Android SDK, Gradle installation or generated Android project, and dependencies are not installed.
- Native biometric transaction authorization is not active. The supplied `device-management` Edge Function does not verify Android Key Attestation certificates. It also omits `device_record_id` from the enrollment challenge response, which the existing signed-message protocol requires. A minimal response-field patch is documented in `native/backend/DEVICE-MANAGEMENT-PATCH.md`.
- Do not set `biometric_transactions_enabled` to true until a trusted server-side verifier validates the full Android attestation chain and extension, app identity/signing certificate, key properties, verified boot and device lock state. Until then, transaction PIN remains the supported fallback.
- The native biometric plugin source has not been compiled against a generated Android project or tested on physical hardware.
- Store screenshots must be captured from the final running app. Release signing, Play Console declarations, developer account registration and store review remain outstanding.

## Google Play policy review required

The current product includes betting-wallet funding. Google Play's real-money gambling policy may restrict this feature in a general wallet app. Review the exact feature and applicable licensing/eligibility before submission; do not assume Play approval.

## Environment configuration

`.env.local` is intentionally excluded from source archives. Copy `.env.example` to `.env.local` and fill in the public Supabase URL/anon key and Paystack public key. Never put Supabase service-role keys, Paystack secret keys, Firebase service-account private keys or Android signing credentials in the client app or source archive.
