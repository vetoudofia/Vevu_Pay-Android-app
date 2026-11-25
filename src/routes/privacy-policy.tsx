import { createFileRoute } from "@tanstack/react-router";
import { PublicLegalPage } from "@/components/PublicLegalPage";

export const Route = createFileRoute("/privacy-policy")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Privacy Policy — VevuPay" },
      {
        name: "description",
        content: "Read the VevuPay Privacy Policy to understand how your information is collected, used, protected, and managed.",
      },
      { property: "og:title", content: "Privacy Policy — VevuPay" },
      {
        property: "og:description",
        content: "Learn how VevuPay handles and protects your personal information.",
      },
    ],
  }),
  component: () => <PublicLegalPage slug="privacy-policy" />,
});
