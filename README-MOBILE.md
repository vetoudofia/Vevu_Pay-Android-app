# VevuPay Android app source

This repository keeps the existing website intact and adds a Capacitor 8 Android build that reuses the VevuPay application UI and backend integrations.

## Build the web assets for Android

```bash
npm install
cp .env.example .env.local
# Fill the public Supabase URL/anon key and Paystack public key.
npm run build:mobile
```

## Generate Android project

```bash
npx cap add android
```

Then follow `native/ANDROID-BIOMETRIC-INTEGRATION.md` to add the custom Android Keystore biometric plugin, AndroidX Biometric dependency and manifest permission. Copy the supplied Firebase config with:

```bash
node scripts/copy-firebase-config.mjs
npx cap sync android
```

## Build

```bash
npm run android:debug
```

Release APK/AAB builds require the user's own secure Android signing key and Play Console setup. Never send signing keys or passwords to anyone or commit them to source control.

## Important biometric limitation

The Android native key/signature plugin is supplied, but financial biometric authorization remains fail-closed until the server verifies Android Key Attestation. Read `native/ANDROID-BIOMETRIC-INTEGRATION.md` and `native/backend/DEVICE-MANAGEMENT-PATCH.md` before attempting enrollment. Existing PIN authorization remains intact.

See `MOBILE-IMPLEMENTATION-STATUS.md` for exact completion status and outstanding release requirements.
