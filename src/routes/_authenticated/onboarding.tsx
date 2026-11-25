// src/routes/_authenticated/onboarding.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ArrowRight, Gift, Wallet, Sparkles, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — VevuPay" }] }),
  component: OnboardingPage,
});

const screens = [
  {
    icon: Sparkles,
    iconColor: "text-cyan-400",
    bgGradient: "from-cyan-500/20 via-blue-500/10 to-transparent",
    title: "Welcome to VevuPay",
    subtitle: "Nigeria's fastest way to pay bills, buy airtime, and earn rewards.",
    bullets: [
      "Buy data, airtime, and pay bills in seconds",
      "Verified Paystack security",
      "No BVN required to get started",
    ],
  },
  {
    icon: Wallet,
    iconColor: "text-emerald-400",
    bgGradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    title: "Get Your Virtual Account",
    subtitle: "Fund your wallet instantly with a dedicated bank account number.",
    bullets: [
      "Free Wema/Titan virtual account",
      "Instant deposits from any bank",
      "Zero setup fees",
    ],
  },
  {
    icon: Gift,
    iconColor: "text-yellow-400",
    bgGradient: "from-yellow-500/20 via-orange-500/10 to-transparent",
    title: "Earn While You Spend",
    subtitle: "Get up to 5% cashback on every purchase, plus ₦100 off your first buy.",
    bullets: [
      "Cashback on data, airtime, and bills",
      "₦100 welcome discount on first purchase",
      "Refer friends and earn ₦50 cashback",
    ],
  },
];

function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const current = screens[step];
  const Icon = current.icon;
  const isLast = step === screens.length - 1;

  const handleNext = async () => {
    if (!isLast) {
      setStep(step + 1);
      return;
    }

    // Final step — mark onboarding as complete
    setSubmitting(true);
    try {
      if (user) {
        await supabase
          .from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);
      }
      toast.success("Welcome to VevuPay! 🎉");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      if (user) {
        await supabase
          .from("profiles")
          .update({ onboarding_completed: true })
          .eq("id", user.id);
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-background">
      {/* Background gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${current.bgGradient} transition-colors duration-700`} />
      <div className="absolute -top-32 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />

      {/* Skip button */}
      <div className="relative z-10 flex justify-end p-6">
        <button
          onClick={handleSkip}
          disabled={submitting}
          className="text-sm text-muted-foreground hover:text-foreground transition disabled:opacity-50"
        >
          Skip
        </button>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-6">
        {/* Icon */}
        <div className={`mb-10 rounded-full bg-background/60 backdrop-blur p-8 shadow-2xl border border-border/40`}>
          <Icon className={`h-16 w-16 ${current.iconColor}`} strokeWidth={1.5} />
        </div>

        {/* Text */}
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {current.title}
          </h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            {current.subtitle}
          </p>

          {/* Bullets */}
          <ul className="mt-8 space-y-3 text-left max-w-sm mx-auto">
            {current.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-3">
                <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <span className="text-sm text-foreground/80">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 px-6 pb-10 space-y-6">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {screens.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-8 bg-primary" : "w-2 bg-muted-foreground/30"
              }`}
              aria-label={`Go to screen ${i + 1}`}
            />
          ))}
        </div>

        {/* Next / Get Started */}
        <button
          onClick={handleNext}
          disabled={submitting}
          className="btn-primary w-full py-3.5 disabled:opacity-50 flex items-center justify-center gap-2 text-base font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              {isLast ? "Get Started" : "Next"}
              <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
