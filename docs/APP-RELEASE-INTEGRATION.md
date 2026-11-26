# VevuPay Android App Release Integration

This source update connects the Capacitor Android app to the deployed Supabase App Release Management backend.

## What the Android app now does

- Checks `get-app-release` on launch and whenever the app returns to the foreground.
- Reads the installed Android `versionName` and `versionCode` from Capacitor's native App plugin.
- Displays an update screen for a newer active release.
- Prevents dismissing an update when the backend marks it mandatory (including the minimum-supported-version rule returned by the backend).
- Opens the configured HTTPS APK or Play Store URL using the Capacitor Browser plugin.
- Records a `requested` download event when the user chooses the update.
- Stores a pending release ID locally and records `completed` only after the app is launched again with the target `versionCode` installed.
- Reports the signed-in user's Android installation, version and device information through `record-app-installed-version`.

The installed-version report is authenticated. Users who are signed out can still check for updates and download them, but their installation is not associated with an account until they sign in.

## GitHub Actions configuration

In the repository containing this Android project, open **Settings → Secrets and variables → Actions → Variables** and set:

| Variable | Example | Purpose |
|---|---|---|
| `VEVUPAY_APP_VERSION` | `1.0.1` | User-facing version name |
| `VEVUPAY_APP_VERSION_CODE` | `2` | Android integer version code; increment for every release |
| `VEVUPAY_DISTRIBUTION_CHANNEL` | `direct` | `direct` for APK builds or `play` for Play Store builds |

The workflow defaults to version `1.0.0`, code `1`, and channel `direct` if variables are absent. Set the code higher than the code of the currently installed app before publishing an update.

The workflow still needs the existing public Supabase and Paystack configuration secrets described in `ANDROID-BUILD-INSTRUCTIONS.md`.

## Release publishing sequence

1. Set the next version name, a strictly higher version code, and the correct distribution channel in GitHub repository variables.
2. Run the Android GitHub Actions workflow.
3. For `direct`, use a **signed release APK** built with the same signing certificate as the already-installed VevuPay app. Upload that APK in the admin dashboard and publish the direct release.
4. For `play`, upload the signed AAB to Google Play Console, wait for the Play release to become available, then publish the Play channel release with its HTTPS Play Store URL in the admin dashboard.
5. Set `minimum_supported_version_code` to the lowest version code that should remain supported. Do not set it higher than the version code being published.
6. Test with an older installed build: confirm the update screen appears, the link opens, the new APK/AAB installs through the normal Android/Play flow, and reopening the app records the installed version and completed download event.

## Signing requirement — do not skip

The existing workflow currently produces an unsigned release APK/AAB. Those artifacts are not suitable for production distribution. Android only accepts an update APK when it is signed by the same signing certificate as the installed app. Configure the original production keystore and credentials in protected CI signing configuration before publishing direct APK updates. Do not create a new key to replace the original app-signing key.

For Google Play, use the existing Play Console app and its configured Play App Signing/upload-key process. Do not upload an unsigned AAB.

## Backend requirements

The Supabase migration and Edge Functions from the App Release Management backend patch must already be deployed:

- `get-app-release`
- `record-app-release-download`
- `record-app-installed-version`

The dashboard's release publishing and lifecycle functions must also remain deployed. The Android client contains only the anon key; never embed a service-role key in the app.

## Analytics semantics

- `requested`: the user tapped the update button and the app attempted to open the download/store URL.
- `completed`: the app subsequently launched with `versionCode >= target_version_code`.
- `app_installed_versions`: latest known version for each signed-in user/device pair, refreshed on sign-in, launch and app foreground.

A completed event means the target version was observed running after the update flow. It does not prove that the user completed every step of a browser download independently of Android installation.

## Build validation status

This source change has not been compiled or tested on a physical Android device in this environment. Run the GitHub Actions build, install the signed APK on a test device, and verify the update flow before publishing a mandatory release.
