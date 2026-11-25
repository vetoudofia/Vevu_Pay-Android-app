import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_URL } from "@/config/env";

/**
 * Passthrough proxy so external services can call the webhook using this
 * app's own domain (nicer for whitelists / branding). It forwards the raw
 * body + signature headers to the actual Supabase edge function which does
 * the signature verification and wallet crediting.
 *
 * External URL (paste into Paystack dashboard):
 *   https://<your-domain>/api/public/paystack-webhook
 *
 * Alternatively, you can still point Paystack directly at:
 *   {SUPABASE_URL}/functions/v1/paystack-webhook
 */
export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const target = `${SUPABASE_URL}/functions/v1/paystack-webhook`;

        // Forward Paystack's signature header + content-type verbatim.
        const forwardHeaders: Record<string, string> = {
          "content-type": request.headers.get("content-type") ?? "application/json",
        };
        const sig = request.headers.get("x-paystack-signature");
        if (sig) forwardHeaders["x-paystack-signature"] = sig;

        try {
          const upstream = await fetch(target, {
            method: "POST",
            headers: forwardHeaders,
            body,
          });
          const text = await upstream.text();
          return new Response(text, {
            status: upstream.status,
            headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Webhook proxy failed";
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 502,
            headers: { "content-type": "application/json" },
          });
        }
      },
      GET: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            message: "Paystack webhook endpoint. POST only.",
          }),
          { headers: { "content-type": "application/json" } },
        ),
    },
  },
});
