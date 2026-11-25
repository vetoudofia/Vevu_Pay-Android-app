import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Slim top-of-viewport progress bar. Shows whenever the router is
 * navigating/loading or TanStack Query is fetching/mutating anywhere.
 */
export function TopProgressBar() {
  const routerBusy = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading || s.isTransitioning,
  });
  const queriesBusy = useIsFetching() > 0;
  const mutationsBusy = useIsMutating() > 0;
  const busy = routerBusy || queriesBusy || mutationsBusy;

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      setVisible(true);
      setProgress((p) => (p < 10 ? 10 : p));
      const tick = () => {
        setProgress((p) => {
          if (p >= 90) return p;
          const step = (90 - p) * 0.04;
          return Math.min(90, p + Math.max(0.4, step));
        });
        rafRef.current = window.setTimeout(tick, 200) as unknown as number;
      };
      tick();
      return () => {
        if (rafRef.current) window.clearTimeout(rafRef.current);
      };
    }
    if (rafRef.current) window.clearTimeout(rafRef.current);
    setProgress(100);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 350);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [busy]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed left-0 right-0 top-0 z-[90] h-0.5 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className="h-full bg-brand-gradient shadow-[0_0_8px_rgba(59,130,246,0.7)] transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
