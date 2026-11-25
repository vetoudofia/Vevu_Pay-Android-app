// src/components/DepositSuccessScreen.tsx
import { Wallet, ArrowDownRight, Home, CheckCircle2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface DepositSuccessScreenProps {
  isOpen: boolean;
  amount: number;
  onClose: () => void;
}

export function DepositSuccessScreen({ isOpen, amount, onClose }: DepositSuccessScreenProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl border border-border animate-in zoom-in-95 duration-300">
        
        {/* Wallet Deposit Animation Container */}
        <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          {/* Glowing Background Pulse */}
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
          
          {/* Outer Ring */}
          <div className="absolute inset-0 rounded-full border-2 border-primary/30" />

          {/* Wallet Icon with Vevu Branding Badge */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Wallet className="h-9 w-9" />
            
            {/* Vevu Tag */}
            <span className="absolute -bottom-1 -right-1 rounded-full bg-background px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary border border-primary/30 shadow">
              Vevu
            </span>
          </div>

          {/* Floating Money In Arrow */}
          <div className="absolute -top-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white shadow-md animate-bounce">
            <ArrowDownRight className="h-4 w-4 stroke-[3]" />
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-black tracking-tight text-foreground">Deposit Successful!</h2>
        <p className="mt-1 text-xs text-muted-foreground">Your wallet has been credited instantly.</p>

        {/* Amount Credited Card */}
        <div className="my-5 rounded-2xl bg-secondary/50 p-4 border border-border/50">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount Credited</span>
          <p className="mt-1 text-3xl font-black text-green-600 dark:text-green-400">
            +₦{amount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={onClose}
            className="w-full rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 transition"
          >
            View Transactions
          </button>
          
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-secondary/80 py-3 text-sm font-semibold text-foreground hover:bg-secondary transition border border-border/50"
          >
            <Home className="h-4 w-4" /> Go to Dashboard
          </button>
        </div>

      </div>
    </div>
  );
}
