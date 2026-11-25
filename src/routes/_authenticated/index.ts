// src/routes/_authenticated/index.tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    // Redirect to /dashboard inside the authenticated layout
    throw redirect({ to: "/dashboard" });
  },
});
