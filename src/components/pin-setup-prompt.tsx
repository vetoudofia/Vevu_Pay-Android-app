import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

interface PinSetupPromptProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
}

export function PinSetupPrompt({
  open,
  onClose,
  title = "Set up your PIN first",
  description = "Create a 6-digit transaction PIN before completing this transaction.",
}: PinSetupPromptProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const handleSetupClick = () => {
    onClose?.();
    navigate({
      to: "/security",
      search: { setupPin: "1" },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>

        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {description}
        </p>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleSetupClick}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Setup
          </button>
        </div>
      </div>
    </div>
  );
}
