import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const androidRoot = resolve(root, "android");
const javaSource = resolve(root, "native/android/app/src/main/java/com/webapp/vevupay");
const javaTarget = resolve(androidRoot, "app/src/main/java/com/webapp/vevupay");
const gradleFile = resolve(androidRoot, "app/build.gradle");
const manifestFile = resolve(androidRoot, "app/src/main/AndroidManifest.xml");

async function exists(path) { try { await access(path); return true; } catch { return false; } }
if (!(await exists(androidRoot))) throw new Error("Android platform is missing. Run npx cap add android first.");
await mkdir(javaTarget, { recursive: true });
for (const file of ["MainActivity.java", "VevuPayBiometricPlugin.java"]) {
  await copyFile(resolve(javaSource, file), resolve(javaTarget, file));
}

// Add the AndroidX biometric library required by the native plugin (idempotent).
let gradle = await readFile(gradleFile, "utf8");
if (!gradle.includes("androidx.biometric:biometric")) {
  const dependencyBlock = /dependencies\s*\{/;
  if (!dependencyBlock.test(gradle)) throw new Error("Could not find dependencies block in android/app/build.gradle");
  gradle = gradle.replace(dependencyBlock, match => `${match}\n    implementation 'androidx.biometric:biometric:1.1.0'`);
  await writeFile(gradleFile, gradle);
}

// Add runtime biometric permission (idempotent).
let manifest = await readFile(manifestFile, "utf8");
if (!manifest.includes("android.permission.USE_BIOMETRIC")) {
  manifest = manifest.replace(/<manifest\b[^>]*>/, match => `${match}\n    <uses-permission android:name="android.permission.USE_BIOMETRIC" />`);
  await writeFile(manifestFile, manifest);
}


// Apply the release identity used by the in-app updater. GitHub Actions writes
// VITE_* values to .env.production.local in an earlier step; that file is NOT
// automatically exported into later step processes. Read it here as a fallback.
const productionEnvText = await readFile(resolve(root, ".env.production.local"), "utf8").catch(() => "");
const productionEnv = Object.fromEntries(
  productionEnvText.split(/\\r?\\n/).flatMap((line) => {
    const match = line.match(/^\\s*(VITE_[A-Z0-9_]+)\\s*=\\s*(.*?)\\s*$/);
    if (!match) return [];
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return [[match[1], value]];
  }),
);
const configured = (key, fallback) => process.env[key] || productionEnv[key] || fallback;

// Always increment VITE_APP_VERSION_CODE for each Android release; Android forbids downgrading it.
const versionName = configured("VITE_APP_VERSION", "1.0.0").trim();
const versionCode = Number.parseInt(configured("VITE_APP_VERSION_CODE", "1"), 10);
if (!versionName || versionName.length > 40) throw new Error("VITE_APP_VERSION must contain 1-40 characters.");
if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error("VITE_APP_VERSION_CODE must be a positive integer.");
const distributionChannel = configured("VITE_DISTRIBUTION_CHANNEL", "direct");
if (distributionChannel !== "direct" && distributionChannel !== "play") throw new Error("VITE_DISTRIBUTION_CHANNEL must be direct or play.");
let versionGradle = await readFile(gradleFile, "utf8");
if (!/versionCode\s+\d+/.test(versionGradle) || !/versionName\s+[\"']/.test(versionGradle)) {
  throw new Error("Could not locate versionCode/versionName in android/app/build.gradle.");
}
versionGradle = versionGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
versionGradle = versionGradle.replace(/versionName\s+[\"'][^\"']*[\"']/, `versionName '${versionName.replace(/'/g, "\\'")}'`);
await writeFile(gradleFile, versionGradle);

// Keep Firebase config present for FCM-capable Android builds.
const firebaseSource = resolve(root, "firebase/google-services.json");
const firebaseTarget = resolve(androidRoot, "app/google-services.json");
if (await exists(firebaseSource)) await copyFile(firebaseSource, firebaseTarget);
console.log("VevuPay Android native source, biometric dependency, permission and Firebase config prepared.");
