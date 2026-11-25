import { copyFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("firebase/google-services.json");
const destinationDirectory = resolve("android/app");
const destination = resolve(destinationDirectory, "google-services.json");

try {
  await access(source);
} catch {
  console.error("Firebase config is missing: firebase/google-services.json");
  process.exitCode = 1;
  process.exit();
}

try {
  await access(destinationDirectory);
} catch {
  console.error("Android platform has not been generated yet. Run: npx cap add android");
  process.exitCode = 1;
  process.exit();
}

await mkdir(destinationDirectory, { recursive: true });
await copyFile(source, destination);
console.log("Firebase Android configuration copied to android/app/google-services.json");
