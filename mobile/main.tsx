import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../src/router";
import { initializeNativeRuntime } from "../src/native/runtime";
import "../src/styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("VevuPay mobile root element was not found.");
}

// Mark the document before the TanStack root route renders so it can use a
// native-app shell instead of emitting server-rendered <html>/<body> elements.
document.documentElement.dataset.vevupayMobile = "true";
document.documentElement.classList.add("native-app");
document.body.classList.add("native-app");

const router = getRouter();
void initializeNativeRuntime(router);

createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
