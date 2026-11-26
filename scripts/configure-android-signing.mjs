import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const androidRoot = resolve(root, "android");
const appGradle = resolve(androidRoot, "app/build.gradle");
const keystorePath = resolve(androidRoot, "app/vevupay-upload-key.jks");
const propertiesPath = resolve(androidRoot, "keystore.properties");

const values = {
  keystoreBase64: process.env.VEVUPAY_ANDROID_KEYSTORE_BASE64,
  storePassword: process.env.VEVUPAY_ANDROID_KEYSTORE_PASSWORD,
  keyAlias: process.env.VEVUPAY_ANDROID_KEY_ALIAS,
  keyPassword: process.env.VEVUPAY_ANDROID_KEY_PASSWORD,
};
const present = Object.values(values).filter((value) => typeof value === "string" && value.length > 0).length;

if (present === 0) {
  console.log("Android signing secrets are not configured. Building the debug APK only; no unsigned release artifact will be published.");
  process.exit(0);
}
if (present !== 4) {
  throw new Error("Android signing configuration is incomplete. Configure all four VEVUPAY_ANDROID_* GitHub Actions secrets.");
}

await access(appGradle);
await mkdir(resolve(androidRoot, "app"), { recursive: true });
const keystore = Buffer.from(values.keystoreBase64.replace(/\s+/g, ""), "base64");
if (keystore.length < 256) {
  throw new Error("VEVUPAY_ANDROID_KEYSTORE_BASE64 does not appear to contain a valid keystore file.");
}
await writeFile(keystorePath, keystore, { mode: 0o600 });

function escapeProperty(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/=/g, "\\=").replace(/:/g, "\\:");
}
const properties = [
  "storeFile=app/vevupay-upload-key.jks",
  `storePassword=${escapeProperty(values.storePassword)}`,
  `keyAlias=${escapeProperty(values.keyAlias)}`,
  `keyPassword=${escapeProperty(values.keyPassword)}`,
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
  const signingConfig = `android {\n    // VEVUPAY_RELEASE_SIGNING_CONFIG\n    signingConfigs {\n        release {\n            storeFile rootProject.file(vevuPaySigningProperties['storeFile'])\n            storePassword vevuPaySigningProperties['storePassword']\n            keyAlias vevuPaySigningProperties['keyAlias']\n            keyPassword vevuPaySigningProperties['keyPassword']\n        }\n    }`;
  gradle = gradle.replace(androidBlock, signingConfig);
}
const buildTypesIndex = gradle.indexOf("buildTypes");
if (buildTypesIndex < 0) throw new Error("Could not locate buildTypes in android/app/build.gradle.");
const buildTypesSection = gradle.slice(buildTypesIndex);
if (!/release\s*\{[\s\S]*?signingConfig\s+signingConfigs\.release/.test(buildTypesSection)) {
  const releaseBlock = /(buildTypes\s*\{\s*release\s*\{)/;
  gradle = gradle.replace(releaseBlock, "$1\n            signingConfig signingConfigs.release");
}
await writeFile(appGradle, gradle);
console.log("VevuPay release signing configured. The keystore and passwords remain in ignored, temporary Android build files.");
