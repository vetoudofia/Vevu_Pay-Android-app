import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, Zap, Wallet, ArrowLeft } from "lucide-react";

const ORGANIZATION_SCHEMA = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Vevu Pay",
  alternateName: ["VevuPay", "Vevu Pay Nigeria"],
  url: "https://vevupay.name.ng",
  logo: "https://vevupay.name.ng/vevupay-icon.png",
  description:
    "Vevu Pay (VevuPay) is a digital wallet and utility payments platform in Nigeria for airtime, mobile data bundles, electricity bills, cable TV subscriptions, betting wallet funding, exam pins, savings goals, and rewards.",
  areaServed: {
    "@type": "Country",
    name: "Nigeria",
  },
});

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Vevu Pay (VevuPay) — Digital Wallet & Bill Payments" },
      {
        name: "description",
        content:
          "Learn about Vevu Pay (VevuPay): wallet funding, transfers, airtime, data bundles, electricity, cable TV, exam pins, savings, and rewards in Nigeria.",
      },
      { property: "og:title", content: "About Vevu Pay (VevuPay)" },
      {
        property: "og:description",
        content:
          "Digital wallet and bill payments platform in Nigeria for airtime, mobile data, electricity, cable TV, betting, and exam pins.",
      },
      { property: "og:image", content: "https://vevupay.name.ng/vevupay-icon.png" },
      { property: "og:type", content: "website" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: ORGANIZATION_SCHEMA,
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Sign In / Get Started
          </Link>
          <div className="flex items-center gap-2">
            <img
              src="/vevupay-icon.png"
              alt="Vevu Pay logo"
              className="h-8 w-8 rounded-lg object-contain border border-slate-800 bg-slate-900"
            />
            <span className="text-sm font-bold text-white">Vevu Pay</span>
          </div>
        </div>

        <section className="rounded-3xl border border-cyan-500/25 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-400">
            About Vevu Pay
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Simple, fast everyday payments & wallet tools in Nigeria
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">
            <strong>Vevu Pay</strong> (also styled as <strong>VevuPay</strong>) helps users
            fund a personal wallet, send transfers, buy mobile airtime and data bundles, pay
            electricity and cable TV bills, fund betting accounts, purchase exam pins, set
            savings goals, and earn cashback or referral rewards.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <Zap className="h-5 w-5 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">Utility Bills & Top-Ups</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Airtime, mobile data, electricity meters, cable TV, betting funding, and exam pins.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <Wallet className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-bold text-white">Wallet & Savings</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Manage your Vevu Pay balance, track transaction history, and save toward goals.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-1.5">
            <ShieldCheck className="h-5 w-5 text-purple-400" />
            <h2 className="text-sm font-bold text-white">Protected Actions</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Transaction PIN verification, privacy controls, and transparent order records.
            </p>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} Vevu Pay. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy-policy" className="hover:text-cyan-400 transition">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-cyan-400 transition">
              Terms of Service
            </Link>
            <Link to="/auth" className="text-cyan-400 font-semibold hover:underline">
              Open App
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

