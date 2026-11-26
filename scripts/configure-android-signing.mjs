import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = process.argv[2];
if (!["app", "upload"].includes(target)) {
  throw new Error("Usage: node scripts/configure-android-signing.mjs <app|upload>");
}

const root = process.cwd();
const androidRoot = resolve(root, "android");
const appRoot = resolve(androidRoot, "app");
const appGradle = resolve(appRoot, "build.gradle");
const keystoreFile = `vevupay-${target}-key.p12`;
const keystorePath = resolve(appRoot, keystoreFile);
const propertiesPath = resolve(androidRoot, "keystore.properties");
const values = {
  keystoreBase64: process.env.VEVUPAY_ANDROID_KEYSTORE_BASE64,
  storePassword: process.env.VEVUPAY_ANDROID_KEYSTORE_PASSWORD,
};
if (Object.values(values).some((value) => typeof value !== "string" || value.length === 0)) {
  throw new Error(`Missing Base64 keystore or password for the ${target} signing key. Check the corresponding GitHub Actions secrets.`);
}

await access(appGradle);
await mkdir(appRoot, { recursive: true });
const normalizedBase64 = values.keystoreBase64.replace(/\s+/g, "");
if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalizedBase64)) {
  throw new Error("The Base64 keystore secret contains invalid characters.");
}
const keystore = Buffer.from(normalizedBase64, "base64");
if (keystore.length < 256) {
  throw new Error("The Base64 secret does not appear to contain a valid keystore.");
}
await writeFile(keystorePath, keystore, { mode: 0o600 });

function escapeProperty(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/=/g, "\\=").replace(/:/g, "\\:");
}
const alias = target === "app" ? "vevupay-app-signing" : "vevupay-upload";
const properties = [
  `storeFile=app/${keystoreFile}`,
  "storeType=PKCS12",
  `storePassword=${escapeProperty(values.storePassword)}`,
  `keyAlias=${alias}`,
  // PKCS12 uses the same password for the keystore and private-key entry here.
  `keyPassword=${escapeProperty(values.storePassword)}`,
  "",
].join("\n");
await writeFile(propertiesPath, properties, { mode: 0o600 });

let gradle = await readFile(appGradle, "utf8");
if (!gradle.includes("// VEVUPAY_RELEASE_SIGNING_PROPERTIES")) {
  const androidBlock = /android\s*\{/;
  if (!androidBlock.test(gradle)) throw new Error("Could not locate the android { } block in android/app/build.gradle.");
  const propertiesBlock = `// VEVUPAY_RELEASE_SIGNING_PROPERTIES\ndef vevuPaySigningProperties = new Properties()\ndef vevuPaySigningPropertiesFile = rootProject.file("keystore.properties")\nif (vevuPaySigningPropertiesFile.exists()) {\n    vevuPaySigningProperties.load(new FileInputStream(vevuPaySigningPropertiesFile))\n}\n\nandroid {`;
  gradle = gradle.replace(androidBlock, propertiesBlock);
}
if (!gradle.includes("// VEVUPAY_RELEASE_SIGNING_CONFIG")) {
  const androidBlock = /android\s*\{/;
  const signingConfig = `android {\n    // VEVUPAY_RELEASE_SIGNING_CONFIG\n    signingConfigs {\n        release {\n            storeFile rootProject.file(vevuPaySigningProperties['storeFile'])\n            storeType vevuPaySigningProperties['storeType']\n            storePassword vevuPaySigningProperties['storePassword']\n            keyAlias vevuPaySigningProperties['keyAlias']\n            keyPassword vevuPaySigningProperties['keyPassword']\n        }\n    }`;
  gradle = gradle.replace(androidBlock, signingConfig);
}
const buildTypesIndex = gradle.indexOf("buildTypes");
if (buildTypesIndex < 0) throw new Error("Could not locate buildTypes in android/app/build.gradle.");
const buildTypesSection = gradle.slice(buildTypesIndex);
if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(buildTypesSection)) {
  const releaseBlock = /(buildTypes\s*\{\s*release\s*\{)/;
  if (!releaseBlock.test(gradle)) throw new Error("Could not locate buildTypes { release { } } in android/app/build.gradle.");
  gradle = gradle.replace(releaseBlock, "$1\n            signingConfig signingConfigs.release");
}
await writeFile(appGradle, gradle);
console.log(`VevuPay ${target} signing configured. Signing material remains in temporary Android build files.`);
