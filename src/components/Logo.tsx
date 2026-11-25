// src/components/Logo.tsx
import { useState } from "react";
import logoAsset from "@/assets/vevupay-logo.png.asset.json";

export function Logo({
  size = 32,
  withWordmark = false,
  className = "",
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  // "primary" -> "/vevupay-icon.png", "asset" -> logoAsset.url, "fallback" -> "V" badge
  const [stage, setStage] = useState<"primary" | "asset" | "fallback">("primary");

  const src =
    stage === "primary"
      ? "/vevupay-icon.png"
      : stage === "asset" && logoAsset?.url
      ? logoAsset.url
      : null;

  const handleError = () => {
    if (stage === "primary" && logoAsset?.url) {
      setStage("asset");
    } else {
      setStage("fallback");
    }
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="relative inline-flex items-center justify-center overflow-hidden rounded-lg shrink-0"
        style={{ width: size, height: size }}
      >
        {src ? (
          <img
            src={src}
            alt="VevuPay"
            width={size}
            height={size}
            onError={handleError}
            className="h-full w-full object-cover"
            style={{ width: size, height: size }}
          />
        ) : (
          <span
            aria-label="VevuPay"
            className="flex h-full w-full items-center justify-center bg-teal-500 font-black text-slate-950 select-none"
            style={{ fontSize: Math.max(12, Math.round(size * 0.48)) }}
          >
            V
          </span>
        )}
      </span>
      {withWordmark && (
        <span className="text-brand-gradient text-lg font-bold tracking-tight">VevuPay</span>
      )}
    </span>
  );
}
