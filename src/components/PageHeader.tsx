import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
  backTo,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backTo?: string;
  eyebrow?: string;
}) {
  const router = useRouter();
  const goBack = () => {
    if (backTo) router.navigate({ to: backTo });
    else router.history.back();
  };

  return (
    <header className="mb-6 flex items-start gap-3">
      <button
        onClick={goBack}
        aria-label="Go back"
        className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card/60 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function BreadcrumbLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-xs font-medium text-muted-foreground hover:text-foreground">
      {children}
    </Link>
  );
}
