import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility route for existing PinGate links.
 *
 * The supplied source archive has a generated /pin route but omitted its
 * screen source. The current transaction-PIN management UI is still present
 * in Security Settings, so route users there with the PIN setup panel opened.
 * Replace this bridge with the dedicated PIN screen when its latest source is
 * restored; do not remove the /pin route from the route tree.
 */
export const Route = createFileRoute("/_authenticated/pin")({
  beforeLoad: () => {
    throw redirect({
      to: "/security",
      search: { setupPin: "1" },
    });
  },
});
