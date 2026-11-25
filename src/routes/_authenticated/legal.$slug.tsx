// src/routes/_authenticated/legal.$slug.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { renderMarkdown } from "@/lib/markdown";

export const Route = createFileRoute("/_authenticated/legal/$slug")({
  component: LegalPage,
});

interface LegalPage {
  slug: string;
  title: string;
  content: string;
  version: number;
  updated_at: string;
}

function LegalPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["legal-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages")
        .select("*")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data as LegalPage;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
        <p className="text-sm font-medium">Page not found</p>
        <button
          onClick={() => navigate({ to: "/settings" })}
          className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate({ to: "/settings" })}
          className="rounded-full p-2 hover:bg-secondary transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            Version {page.version} · Updated {new Date(page.updated_at).toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>

      <div
        className="text-sm text-muted-foreground"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
      />

      <div className="mt-10 pt-6 border-t border-border text-center">
        <p className="text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} VevuPay. All rights reserved. Registered in Nigeria.
        </p>
      </div>
    </div>
  );
}
