import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const androidRoot = resolve(root, "android");
const javaSource = resolve(root, "native/android/app/src/main/java/com/webapp/vevupay");
const javaTarget = resolve(androidRoot, "app/src/main/java/com/webapp/vevupay");
const gradleFile = resolve(androidRoot, "app/build.gradle");
const manifestFile = resolve(androidRoot, "app/src/main/AndroidManifest.xml");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(androidRoot))) {
  throw new Error("Android platform is missing. Run npx cap add android first.");
}

await mkdir(javaTarget, { recursive: true });
for (const file of ["MainActivity.java", "VevuPayBiometricPlugin.java"]) {
  await copyFile(resolve(javaSource, file), resolve(javaTarget, file));
}
await rm(resolve(javaTarget, "VevuPayUpdaterPlugin.java"), { force: true });

// Add the AndroidX biometric library required by the native plugin (idempotent).
let gradle = await readFile(gradleFile, "utf8");
if (!gradle.includes("androidx.biometric:biometric")) {
  const dependencyBlock = /dependencies\s*\{/;
  if (!dependencyBlock.test(gradle)) {
    throw new Error("Could not find dependencies block in android/app/build.gradle");
  }
  gradle = gradle.replace(
    dependencyBlock,
    (match) => `${match}\n    implementation 'androidx.biometric:biometric:1.1.0'`,
  );
  await writeFile(gradleFile, gradle);
}

// Remove leftover updater FileProvider XML if present from earlier builds.
await rm(resolve(androidRoot, "app/src/main/res/xml/vevupay_file_paths.xml"), {
  force: true,
});

// Clean up updater FileProvider and REQUEST_INSTALL_PACKAGES; ensure USE_BIOMETRIC is present.
let manifest = await readFile(manifestFile, "utf8");
let manifestChanged = false;

const providerRegex =
  /\s*<provider\s+android:name="androidx\.core\.content\.FileProvider"[\s\S]*?<\/provider>/g;
if (providerRegex.test(manifest)) {
  manifest = manifest.replace(providerRegex, "");
  manifestChanged = true;
}

const installPermRegex =
  /\s*<uses-permission\s+android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s*\/>/g;
if (installPermRegex.test(manifest)) {
  manifest = manifest.replace(installPermRegex, "");
  manifestChanged = true;
}

if (!manifest.includes("android.permission.USE_BIOMETRIC")) {
  manifest = manifest.replace(
    /<manifest\b[^>]*>/,
    (match) => `${match}\n    <uses-permission android:name="android.permission.USE_BIOMETRIC" />`,
  );
  manifestChanged = true;
}

if (manifestChanged) {
  await writeFile(manifestFile, manifest);
}

// Apply the release version metadata.
// GitHub Actions writes Vite variables to .env.production.local. Vite reads
// that file automatically, but Node scripts do not, so load it explicitly.
const productionEnvPath = resolve(root, ".env.production.local");
let productionEnv = {};
if (await exists(productionEnvPath)) {
  const envText = await readFile(productionEnvPath, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    productionEnv[match[1]] = value;
  }
}

const versionName = (
  process.env.VITE_APP_VERSION ||
  productionEnv.VITE_APP_VERSION ||
  "1.0.0"
).trim();
const versionCode = Number.parseInt(
  process.env.VITE_APP_VERSION_CODE || productionEnv.VITE_APP_VERSION_CODE || "1",
  10,
);
if (!versionName || versionName.length > 40) {
  throw new Error("VITE_APP_VERSION must contain 1-40 characters.");
}
if (!Number.isSafeInteger(versionCode) || versionCode < 1) {
  throw new Error("VITE_APP_VERSION_CODE must be a positive integer.");
}

const distributionChannel =
  process.env.VITE_DISTRIBUTION_CHANNEL ||
  productionEnv.VITE_DISTRIBUTION_CHANNEL ||
  "direct";
if (distributionChannel !== "direct" && distributionChannel !== "play") {
  throw new Error("VITE_DISTRIBUTION_CHANNEL must be direct or play.");
}

let versionGradle = await readFile(gradleFile, "utf8");
if (!/versionCode\s+\d+/.test(versionGradle) || !/versionName\s+["']/.test(versionGradle)) {
  throw new Error("Could not locate versionCode/versionName in android/app/build.gradle.");
}
versionGradle = versionGradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
versionGradle = versionGradle.replace(
  /versionName\s+["'][^"']*["']/,
  `versionName '${versionName.replace(/'/g, "\\'")}'`,
);
await writeFile(gradleFile, versionGradle);

// Keep Firebase config present for FCM-capable Android builds.
const firebaseSource = resolve(root, "firebase/google-services.json");
const firebaseTarget = resolve(androidRoot, "app/google-services.json");
if (await exists(firebaseSource)) {
  await copyFile(firebaseSource, firebaseTarget);
}

console.log(
  "VevuPay Android native biometric setup, version metadata and Firebase config prepared (APK auto-update removed).",
);
