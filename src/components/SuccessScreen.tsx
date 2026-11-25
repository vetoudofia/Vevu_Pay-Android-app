// src/components/SuccessScreen.tsx
import { useNavigate } from "@tanstack/react-router";
import { Check, Receipt } from "lucide-react";

interface SuccessScreenProps {
  isOpen: boolean;
  amount: number;
  onClose: () => void;
}

export function SuccessScreen({ isOpen, amount, onClose }: SuccessScreenProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleViewReceipt = () => {
    onClose();
    navigate({ to: "/transactions" });
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-300">
      
      {/* Animated SVG Check */}
      <div className="relative flex h-32 w-32 items-center justify-center mb-6">
        <svg className="h-full w-full" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Animated Circle */}
          <circle 
            cx="50" cy="50" r="45" 
            stroke="currentColor" 
            strokeWidth="6" 
            className="text-green-500 stroke-dasharray-[283] stroke-dashoffset-[283] animate-[draw_0.8s_ease-out_forwards]" 
          />
          {/* Animated Tick */}
          <path 
            d="M30 50 L45 65 L70 35" 
            stroke="currentColor" 
            strokeWidth="6" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className="text-green-500 stroke-dasharray-[60] stroke-dashoffset-[60] animate-[draw_0.5s_ease-out_0.6s_forwards]" 
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-2 animate-in slide-in-from-bottom-4 fade-in delay-700 duration-500 fill-mode-both">
        Transaction Successful!
      </h1>
      <p className="text-muted-foreground mb-8 animate-in slide-in-from-bottom-4 fade-in delay-700 duration-500 fill-mode-both">
        Your payment of ₦{amount.toLocaleString()} was successful.
      </p>

      <div className="flex w-full max-w-xs flex-col gap-3 animate-in slide-in-from-bottom-8 fade-in delay-1000 duration-500 fill-mode-both">
        <button 
          onClick={handleViewReceipt}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary p-3 font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Receipt className="h-5 w-5" /> View Receipt
        </button>
        <button 
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary p-3 font-semibold text-secondary-foreground transition hover:bg-secondary/80"
        >
          Okay
        </button>
      </div>
    </div>
  );
}

/* Add this to your global.css (or tailwind.config.js) for the animation to work */
/*
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
*/
