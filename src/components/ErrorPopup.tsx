// src/components/ErrorPopup.tsx
import { AlertCircle, X } from "lucide-react";

interface ErrorPopupProps {
  isOpen: boolean;
  message: string | null;
  onClose: () => void;
}

export function ErrorPopup({ isOpen, message, onClose }: ErrorPopupProps) {
  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-destructive/20 bg-card shadow-2xl animate-in zoom-in-95 duration-200">
        
        {/* Red Top Bar */}
        <div className="h-2 w-full bg-destructive" />

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 text-destructive">
              <div className="rounded-full bg-destructive/10 p-2">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">Transaction Failed</h3>
            </div>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-secondary">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <div className="mt-4 rounded-lg bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">
              {message}
            </p>
          </div>

          <button
            onClick={onClose}
            className="mt-6 w-full rounded-xl bg-destructive py-3 font-semibold text-white transition hover:bg-destructive/90"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
