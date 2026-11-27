import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Client-only Vite configuration for Capacitor.
 *
 * The website continues using vite.config.ts.
 * The mobile build uses the same TanStack file-based routes
 * and generates the shared routeTree.gen.ts before compilation.
 */
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./mobile", import.meta.url)),

  envDir: projectRoot,

  base: "./",

  plugins: [
    // IMPORTANT: Generate the route tree before React processes the app.
    tanstackRouter({
      target: "react",
      // Vite's root is ./mobile, but TanStack routes live in the project-root ./src.
      // Use absolute paths so the generator never looks for mobile/src/routes.
      routesDirectory: fileURLToPath(new URL("./src/routes", import.meta.url)),
      generatedRouteTree: fileURLToPath(new URL("./src/routeTree.gen.ts", import.meta.url)),
      autoCodeSplitting: false,
    }),

    react(),

    tailwindcss(),
  ],

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
