import { useEffect, useState } from "react";

/**
 * Renders a soft gradient placeholder and swaps in the real image once it
 * finishes decoding. Prevents layout shift when a photo is slow to arrive.
 */
export function SmartImage({
  src,
  alt = "",
  className = "",
  aspect = "aspect-square",
  rounded = "rounded-xl",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  aspect?: string;
  rounded?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
    if (!src) return;
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.onerror = () => setErrored(true);
    img.src = src;
  }, [src]);

  return (
    <div className={`relative overflow-hidden ${aspect} ${rounded} ${className}`}>
      <div
        aria-hidden
        className={`absolute inset-0 bg-gradient-to-br from-brand-blue/25 via-brand-cyan/15 to-brand-green/20 ${
          loaded ? "opacity-0" : "animate-pulse opacity-100"
        } transition-opacity duration-500`}
      />
      {src && !errored && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-opacity duration-500 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
