import { createFileRoute } from "@tanstack/react-router";
import { PublicLegalPage } from "@/components/PublicLegalPage";

export const Route = createFileRoute("/terms")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Terms and Conditions — VevuPay" },
      {
        name: "description",
        content: "Read the VevuPay Terms and Conditions governing the use of VevuPay services.",
      },
      { property: "og:title", content: "Terms and Conditions — VevuPay" },
      {
        property: "og:description",
        content: "Review the terms governing the use of VevuPay.",
      },
    ],
  }),
  component: () => <PublicLegalPage slug="terms" />,
});
