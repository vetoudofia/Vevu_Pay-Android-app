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

// Keep Firebase config present for FCM-capable Android builds.
const firebaseSource = resolve(root, "firebase/google-services.json");
const firebaseTarget = resolve(androidRoot, "app/google-services.json");
if (await exists(firebaseSource)) await copyFile(firebaseSource, firebaseTarget);
console.log("VevuPay Android native source, biometric dependency, permission and Firebase config prepared.");
