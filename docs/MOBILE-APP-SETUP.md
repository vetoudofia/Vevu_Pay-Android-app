# VevuPay Android application

This repository keeps the existing TanStack Start website and adds a separate client-only Vite entry for the Capacitor Android application. Both use the same React routes, components, Supabase client, and VevuPay visual theme.

## Application identity

- Display name: VevuPay
- Android application ID: `com.webapp.vevupay`
- Firebase project: `vevu-pay`
- Mobile build output: `dist-mobile/`
- Native wrapper: Capacitor 8

## Required build environment

- Node.js 22 or newer
- npm
- Android Studio 2025.2.1 or newer
- Android SDK Platform API 24 or newer
- Android SDK Build Tools and Platform Tools

## Local setup

1. Copy `.env.example` to `.env.local` and fill in the Supabase URL, Supabase anon/publishable key, and Paystack public key.
2. Install packages: `npm install`.
3. Build the mobile web bundle: `npm run build:mobile`.
4. Generate the Android project and app icons/splash assets once: `npm run cap:add:android`.
5. For later source changes, sync plugins and assets: `npm run cap:sync:android`.
6. Open Android Studio: `npm run cap:open:android`.

The Firebase configuration is kept at `firebase/google-services.json` in this source tree and copied to `android/app/google-services.json` by the sync helper. It must match the Android application ID exactly.

## Android build outputs

After Android Studio/SDK setup and release signing are configured:

- APK: `cd android && ./gradlew assembleRelease`
- AAB: `cd android && ./gradlew bundleRelease`

The APK is for direct installation/testing. The AAB is the preferred Google Play upload artifact. Do not distribute an unsigned release build.

## Signing

Create and protect the upload keystore outside source control. Do not commit the keystore, its password, or signing properties. Configure release signing locally or through protected CI secrets. Google Play App Signing should be enabled when creating the Play Console app.

## Security boundaries

- Supabase URL and anon/publishable key are public client configuration. RLS and Edge Function authorization remain mandatory.
- Never put Supabase service-role keys, Paystack secret keys, Firebase service-account JSON, or private signing keys in this repository or the mobile app.
- Firebase `google-services.json` contains Android client configuration, not the Firebase Admin service-account private key.
- Transfer authorization continues to use the deployed `initiate-transfer` and `complete-transfer` Edge Functions. Do not replace that flow with direct wallet writes from the app.
- Native biometric transaction signing is not enabled by this scaffold. It requires the Android Keystore key/attestation integration and the deployed `device-management` verification contract. The deployed backend currently fails biometric transaction authorization closed until genuine Android hardware-backed key attestation is verified. PIN authorization remains the safe fallback until that work is completed and tested.

## Current integration notes

- The mobile build uses the existing route tree and shared frontend code.
- Native back-button, status-bar, keyboard-resize, and splash-screen lifecycle integration are included.
- Android device registration uses the existing `device-management` Edge Function. FCM permission is requested only when the user taps **Enable alerts** on the Notifications screen; the resulting token is registered through `device-management` against the same active Android device.
- The supplied source archive omitted `src/routes/_authenticated/pin.tsx`, although the generated route tree imports it and `PinGate` links to `/pin`. A temporary compatibility redirect now routes `/pin` to the existing PIN setup section in Security Settings. Replace it with the latest dedicated PIN screen before final release if that separate screen is still the intended UX.
- `src/config/env.ts` originally required the Paystack public key at application startup. It has been made optional at startup; wallet funding will show a clear configuration error until the public key is supplied.

## Google Play publishing checklist

Before submission, complete the Play Console developer account registration, app identity and contact details, privacy policy URL, Data safety form, app access instructions, content rating, target audience, financial-features declarations, screenshots, feature graphic, and signed AAB upload. Review the betting-wallet funding feature against Google's real-money gambling policy before publishing; a general wallet app may not include functionality that manages gambling participation funds. Store review and account verification are separate from generating the APK/AAB.
