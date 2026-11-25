import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { renderMarkdown } from "@/lib/markdown";
import { Logo } from "@/components/Logo";

interface LegalPage {
  title: string;
  content: string;
  version: number;
  updated_at: string;
}

interface PublicLegalPageProps {
  slug: "terms" | "privacy-policy";
}

export function PublicLegalPage({ slug }: PublicLegalPageProps) {
  const { data: page, isLoading, error, refetch } = useQuery({
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
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <Logo />
          </Link>

          <Link
            to="/auth"
            className="rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Open VevuPay
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
        <Link
          to="/auth"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to VevuPay
        </Link>

        {isLoading ? (
          <div className="flex min-h-[350px] flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading legal document...
            </p>
          </div>
        ) : error || !page ? (
          <div className="flex min-h-[350px] flex-col items-center justify-center text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />

            <h1 className="mt-4 text-xl font-bold">
              Unable to load document
            </h1>

            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              We couldn't retrieve this document right now. Please check your
              internet connection and try again.
            </p>

            <button
              onClick={() => refetch()}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Document heading */}
            <div className="mb-8 border-b border-border pb-7">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
                VevuPay Legal
              </p>

              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                {page.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>Version {page.version}</span>

                <span className="h-1 w-1 rounded-full bg-muted-foreground" />

                <span>
                  Last updated{" "}
                  {new Date(page.updated_at).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            {/* Legal document */}
            <article
              className="legal-document text-sm leading-7 text-muted-foreground sm:text-base"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(page.content),
              }}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} VevuPay. All rights reserved.
            </p>

            <div className="flex flex-wrap justify-center gap-5 text-xs text-muted-foreground">
              <Link
                to="/privacy-policy"
                className="transition hover:text-primary"
              >
                Privacy Policy
              </Link>

              <Link
                to="/terms"
                className="transition hover:text-primary"
              >
                Terms and Conditions
              </Link>

              <Link
                to="/auth"
                className="transition hover:text-primary"
              >
                Open VevuPay
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
