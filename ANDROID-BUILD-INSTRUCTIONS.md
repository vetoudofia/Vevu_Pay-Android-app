# VevuPay Android branch build

This package contains the full VevuPay source tree plus a separate Capacitor Android build path. The existing website Vite/TanStack configuration is retained. The Android workflow runs only on the `android-build` branch; it does not run on `main`.

## Required one-time GitHub setup

1. Create a branch named `android-build` from the current `main` branch.
2. Upload the **contents** of this ZIP's `vevupay-Website-Frontend` project folder to the root of that branch (do not upload the enclosing ZIP or create a nested project folder).
3. In the repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `VITE_SUPABASE_URL` — your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — the public anon/publishable key only. Never use a service-role key.
   - `VITE_PAYSTACK_PUBLIC_KEY` — your Paystack public key (`pk_test_...` or `pk_live_...`).
4. Open **Actions → VevuPay Android APK and AAB → Run workflow**, select `android-build`, and run it. Later pushes to `android-build` automatically start a build.

## Artifacts and signing

The workflow creates a debug APK (install/testing), an unsigned release APK and an unsigned release AAB. Google Play requires a properly signed AAB; a signed production release requires an Android upload keystore and secure signing configuration, which is not included in this package. Do not upload the unsigned AAB to Play Console.

## Important feature and release limitations

- The APK/AAB are built from the same application source. The mobile package does not independently implement features absent from the supplied VevuPay source.
- The native biometric plugin source is included and wired into the generated Android project. However, the supplied backend does not validate Android hardware key attestation. Therefore biometric transaction authorization must remain disabled and the existing transaction PIN remains the safe financial-transaction fallback. A local fingerprint prompt is not a substitute for server-side authorization.
- Push notifications depend on the Firebase project configuration and server-side FCM setup being valid for this app.
- This package has not been compiled or tested on a physical Android device in this environment. The first GitHub Actions run is the required build validation.
- Google Play eligibility for betting-related wallet functionality must be reviewed before submission.

## Website safety

The workflow triggers only for `android-build`. Do not merge Android-specific changes into `main` until you intentionally want them in the website source. The original `vite.config.ts` and website `build` script are preserved.
