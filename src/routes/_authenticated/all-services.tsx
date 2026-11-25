import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CreditCard,
  Wifi,
  Tv,
  Zap,
  Dice6,
  BookOpen,
  Gift,
  ArrowLeft,
  PiggyBank,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/all-services")({
  head: () => ({ meta: [{ title: "All Services — VevuPay" }] }),
  component: AllServices,
});

interface ServiceTile {
  name: string;
  icon: typeof CreditCard;
  tint: string;
  to: "/purchase/$service" | "/savings" | "/referrals";
  params?: { service: "airtime" | "data" | "tv" | "electricity" | "bet" | "education" };
}

const categories: Array<{
  name: string;
  icon: typeof CreditCard;
  services: ServiceTile[];
}> = [
  {
    name: "Payments",
    icon: CreditCard,
    services: [
      {
        name: "Airtime",
        icon: CreditCard,
        tint: "from-blue-600/30 via-cyan-500/20 to-blue-900/40 border-blue-500/30 text-cyan-400",
        to: "/purchase/$service",
        params: { service: "airtime" },
      },
      {
        name: "Data",
        icon: Wifi,
        tint: "from-cyan-600/30 via-emerald-500/20 to-teal-900/40 border-cyan-500/30 text-teal-400",
        to: "/purchase/$service",
        params: { service: "data" },
      },
      {
        name: "Cable TV",
        icon: Tv,
        tint: "from-purple-600/30 via-blue-500/20 to-indigo-900/40 border-purple-500/30 text-purple-400",
        to: "/purchase/$service",
        params: { service: "tv" },
      },
      {
        name: "Electricity",
        icon: Zap,
        tint: "from-amber-600/30 via-orange-500/20 to-amber-950/40 border-amber-500/30 text-amber-400",
        to: "/purchase/$service",
        params: { service: "electricity" },
      },
      {
        name: "Betting",
        icon: Dice6,
        tint: "from-fuchsia-600/30 via-pink-500/20 to-purple-950/40 border-fuchsia-500/30 text-pink-400",
        to: "/purchase/$service",
        params: { service: "bet" },
      },
      {
        name: "Exam Pins",
        icon: BookOpen,
        tint: "from-indigo-600/30 via-blue-500/20 to-indigo-950/40 border-indigo-500/30 text-indigo-400",
        to: "/purchase/$service",
        params: { service: "education" },
      },
    ],
  },
  {
    name: "Savings",
    icon: PiggyBank,
    services: [
      {
        name: "My Savings",
        icon: PiggyBank,
        tint: "from-emerald-600/30 via-green-500/20 to-emerald-950/40 border-emerald-500/30 text-emerald-400",
        to: "/savings",
      },
    ],
  },
  {
    name: "Rewards",
    icon: Gift,
    services: [
      {
        name: "Earn More",
        icon: Gift,
        tint: "from-purple-600/30 via-fuchsia-500/20 to-purple-950/40 border-purple-500/30 text-purple-400",
        to: "/referrals",
      },
    ],
  },
];

function ServiceButton({ service }: { service: ServiceTile }) {
  const IconComponent = service.icon;
  const className = `group relative overflow-hidden rounded-2xl bg-gradient-to-br ${service.tint} border p-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col items-center justify-center gap-1.5 min-h-[82px]`;

  const content = (
    <>
      <div className="p-2 rounded-xl bg-slate-900/60 border border-white/10 shadow-inner group-hover:scale-105 transition-transform duration-200">
        <IconComponent className="h-4 w-4" />
      </div>
      <span className="text-[11px] font-semibold text-slate-200 leading-tight">
        {service.name}
      </span>
    </>
  );

  if (service.to === "/purchase/$service" && service.params) {
    return (
      <Link to="/purchase/$service" params={service.params} className={className}>
        {content}
      </Link>
    );
  }

  if (service.to === "/savings") {
    return (
      <Link to="/savings" className={className}>
        {content}
      </Link>
    );
  }

  return (
    <Link to="/referrals" className={className}>
      {content}
    </Link>
  );
}

function AllServices() {
  return (
    <div className="p-4 max-w-2xl mx-auto pb-16 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="p-2 -ml-2 rounded-full bg-slate-900/80 border border-slate-800 text-slate-300 hover:bg-slate-800 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-extrabold text-white">All Services</h1>
      </div>

      {categories.map((category) => {
        const CategoryIcon = category.icon;
        return (
          <section key={category.name} className="space-y-3">
            <div className="flex items-center gap-2">
              <CategoryIcon className="h-4 w-4 text-cyan-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {category.name}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {category.services.map((service) => (
                <ServiceButton key={service.name} service={service} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
