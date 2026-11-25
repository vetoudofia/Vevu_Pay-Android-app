import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * A client-only Vite entry for Capacitor. The website continues to use the
 * existing TanStack Start/Nitro configuration in vite.config.ts.
 */
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),
  envDir: projectRoot,
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist-mobile", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
  server: {
    host: "0.0.0.0",
  },
  define: {
    __VEVUPAY_NATIVE_BUILD__: "true",
  },
});
