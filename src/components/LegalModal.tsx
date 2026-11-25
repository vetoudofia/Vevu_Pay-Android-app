// src/components/LegalModal.tsx
import { useQuery } from "@tanstack/react-query";
import { X, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { renderMarkdown } from "@/lib/markdown";

interface LegalModalProps {
  slug: "terms" | "privacy-policy";
  onClose: () => void;
}

interface LegalPage {
  title: string;
  content: string;
  version: number;
  updated_at: string;
}

export function LegalModal({ slug, onClose }: LegalModalProps) {
  const { data: page, isLoading, error } = useQuery({
    queryKey: ["legal-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages")
        .select("title, content, version, updated_at")
        .eq("slug", slug)
        .single();
      if (error) throw error;
      return data as LegalPage;
    },
  });

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-card w-full sm:max-w-2xl max-h-[90vh] sm:rounded-2xl rounded-t-3xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-lg font-bold">{page?.title || (slug === "terms" ? "Terms of Service" : "Privacy Policy")}</h2>
            {page && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                Version {page.version} · Updated {new Date(page.updated_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-secondary transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error || !page ? (
            <div className="text-center py-8">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
              <p className="text-sm font-medium">Failed to load content</p>
              <p className="text-xs text-muted-foreground mt-1">Please try again later.</p>
            </div>
          ) : (
            <div
              className="text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="btn-primary w-full py-2.5"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
