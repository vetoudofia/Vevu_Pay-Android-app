// src/routes/_authenticated/privacy.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PrivacySettings } from "@/components/PrivacySettings";

export const Route = createFileRoute("/_authenticated/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <button
        onClick={() => navigate({ to: "/settings" })}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </button>

      <h1 className="text-2xl font-bold mb-6">Privacy</h1>
      <PrivacySettings />
    </div>
  );
}

