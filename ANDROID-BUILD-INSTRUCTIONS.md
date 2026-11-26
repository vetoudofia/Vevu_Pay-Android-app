# VevuPay Android branch build

This package contains the VevuPay source tree and the Capacitor Android build path. The Android workflow runs only on the `android-build` branch; it does not run on `main`.

## GitHub repository setup

1. Create a branch named `android-build` from the intended source branch.
2. Upload the **contents** of this project folder to the root of `android-build` (do not upload the ZIP itself or create a nested project folder).
3. Open **Repository → Settings → Secrets and variables → Actions → New repository secret** and add the following secrets:

   - `VITE_SUPABASE_URL` — your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — public anon/publishable key only. Never use a service-role key.
   - `VITE_PAYSTACK_PUBLIC_KEY` — Paystack public key (`pk_test_...` or `pk_live_...`).
   - `VEVUPAY_ANDROID_APP_KEYSTORE_BASE64` — Base64 encoding of `vevupay-app-signing.p12`.
   - `VEVUPAY_ANDROID_APP_KEYSTORE_PASSWORD` — contents of `app-signing.pass`.
   - `VEVUPAY_ANDROID_UPLOAD_KEYSTORE_BASE64` — Base64 encoding of `vevupay-upload-key.p12`.
   - `VEVUPAY_ANDROID_UPLOAD_KEYSTORE_PASSWORD` — contents of `upload-key.pass`.

4. Under **Settings → Secrets and variables → Actions → Variables**, add:
   - `VEVUPAY_APP_VERSION` — display version, e.g. `1.0.1`.
   - `VEVUPAY_APP_VERSION_CODE` — positive integer, e.g. `2`; increase for every release and never reuse/decrease it.
   - `VEVUPAY_DISTRIBUTION_CHANNEL` — `direct` for direct APK builds or `play` for Play builds.
5. Open **Actions → VevuPay Android APK and AAB → Run workflow**, select `android-build`, and run it.

## Why there are two keystores

- The direct-install APK is signed with `vevupay-app-signing.p12` and alias `vevupay-app-signing`.
- The Google Play AAB is signed with `vevupay-upload-key.p12` and alias `vevupay-upload`.
- These PKCS12 files use the same password for the keystore and private-key entry. The workflow configures and builds the APK first, then switches to the upload key and builds the AAB.
- The app-signing certificate fingerprint must be retained for direct APK updates. The upload certificate must be registered as the upload key in Play Console. Google Play App Signing uses its own app-signing key to sign APKs delivered to users.

To create each Base64 secret in Termux without printing the encoded keystore into the chat, use a local file and copy its contents directly into the matching GitHub secret field. Never paste a keystore, password, or Base64 value into a chat, issue, commit, or source file.

## Build validation and release safety

The workflow verifies the APK with `apksigner` and the AAB with `jarsigner`, then uploads both as GitHub Actions artifacts. Download and verify the artifacts before distributing them. For a direct update, compare the new APK SHA-256 signing-certificate fingerprint with the certificate of the currently installed production APK. If they differ, Android will not install it as an in-place update; do not uninstall the existing app until the new build is verified and tested.

The project has not been compiled or tested on a physical Android device in this environment. The first GitHub Actions run is required build validation. Native biometric transaction authorization must remain disabled until server-side authorization and hardware-backed key validation are implemented and verified. Push notifications require valid Firebase and server-side FCM configuration. Google Play eligibility for betting-related wallet functionality must be reviewed before submission.

## Website safety

The workflow triggers only for `android-build`. Keep Android-specific work on that branch until you intentionally decide to merge it into the website source.
