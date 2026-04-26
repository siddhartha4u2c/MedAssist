"use client";

import { PortalCarouselSlideshow } from "@/components/landing/portal-carousel-slideshow";

type HomeHeroMarqueeProps = {
  className?: string;
};

export function HomeHeroMarquee({ className = "" }: HomeHeroMarqueeProps) {
  return <PortalCarouselSlideshow variant="landing" className={className} />;
}
