"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import {
  PORTAL_CAROUSEL_BY_PAGE,
  type PortalCarouselPage,
} from "@/lib/portal-carousel-images";

const SLIDE_MS = 5000;

const shellClass: Record<PortalCarouselPage, string> = {
  landing: "mx-auto w-full max-w-3xl md:max-w-4xl",
  login: "mx-auto w-full max-w-lg",
  register: "mx-auto w-full max-w-lg",
};

const sizesAttr: Record<PortalCarouselPage, string> = {
  landing: "(max-width: 768px) 100vw, 896px",
  login: "(max-width: 768px) 100vw, 512px",
  register: "(max-width: 768px) 100vw, 512px",
};

type PortalCarouselSlideshowProps = {
  variant: PortalCarouselPage;
  className?: string;
};

export function PortalCarouselSlideshow({ variant, className = "" }: PortalCarouselSlideshowProps) {
  const items = PORTAL_CAROUSEL_BY_PAGE[variant];
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const onError = useCallback((key: string) => {
    setBroken((prev) => ({ ...prev, [key]: true }));
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [variant]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  const item = items[index];
  const assetKey = `${variant}/${item.file}`;
  const isBroken = broken[assetKey];
  const inactiveDot =
    variant === "landing"
      ? "bg-white/35 hover:bg-white/55"
      : "bg-white/30 hover:bg-white/50";

  const placeholderPath = `public/images/portal-carousel/${variant}/${item.file}`;

  return (
    <section
      className={`w-full px-1 py-1 ${className}`.trim()}
      aria-label="Healthcare setting illustrations"
      aria-live="polite"
    >
      <div className={shellClass[variant]}>
        <div
          key={assetKey}
          className="home-slide-frame relative aspect-video w-full overflow-hidden rounded-2xl shadow-xl ring-2 ring-white/25"
        >
          {isBroken ? (
            <div
              className="flex min-h-[10rem] w-full flex-col items-center justify-center bg-gradient-to-br from-cyan-900/80 via-slate-800 to-blue-950 p-4 text-center md:min-h-[12rem]"
              role="img"
              aria-label={item.alt}
            >
              <p className="text-xs font-medium text-cyan-100/90 md:text-sm">
                Add {item.file} to{" "}
                <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[10px] text-white">
                  {placeholderPath}
                </code>
              </p>
            </div>
          ) : (
            <Image
              src={`/images/portal-carousel/${variant}/${item.file}`}
              alt={item.alt}
              fill
              className="home-slide-image object-cover"
              sizes={sizesAttr[variant]}
              unoptimized
              priority={index === 0 && variant === "landing"}
              onError={() => onError(assetKey)}
            />
          )}
        </div>

        <nav className="mt-3 flex justify-center gap-2 md:mt-4" aria-label="Image slideshow">
          {items.map((dot, i) => (
            <button
              key={dot.file}
              type="button"
              aria-current={i === index ? "true" : undefined}
              aria-label={`Show slide ${i + 1}`}
              className={`h-2 rounded-full transition-all md:h-2.5 ${
                i === index ? "w-7 bg-amber-400 md:w-8" : `w-2 md:w-2.5 ${inactiveDot}`
              }`}
              onClick={() => setIndex(i)}
            />
          ))}
        </nav>
      </div>
    </section>
  );
}
