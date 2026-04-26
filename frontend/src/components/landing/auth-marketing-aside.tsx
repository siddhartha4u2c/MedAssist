"use client";

import { PortalCarouselSlideshow } from "@/components/landing/portal-carousel-slideshow";

const LOGIN_BULLETS = [
  "Secure access for patients, doctors, and hospital administrators.",
  "Symptoms, reports, vitals, medications, and care plans in one connected portal.",
  "Designed for telemedicine and remote monitoring alongside your clinical team.",
];

const REGISTER_BULLETS = [
  "Submit one registration request for administrator approval before activation.",
  "Choose patient or healthcare provider access when your organisation enables it.",
  "Use MedAssist in line with your hospital or clinic policies and local regulations.",
];

type AuthMarketingAsideProps = {
  variant: "login" | "register";
};

export function AuthMarketingAside({ variant }: AuthMarketingAsideProps) {
  const bullets = variant === "login" ? LOGIN_BULLETS : REGISTER_BULLETS;
  const title =
    variant === "login" ? "Welcome back" : "Join MedAssist";
  const subtitle =
    variant === "login"
      ? "Sign in to continue your care journey with the same team and tools."
      : "Create an account so your organisation can review and activate your access.";

  return (
    <aside className="relative flex flex-col overflow-hidden bg-gradient-to-br from-teal-600 via-cyan-700 to-blue-900 px-6 py-10 text-white lg:w-[46%] lg:min-h-screen lg:max-w-none lg:py-14 xl:px-10">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-400/25 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-56 w-56 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />

      <div className="relative z-[1] max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/95">MedAssist AI</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight md:text-3xl">{title}</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-cyan-50/95 md:text-[0.95rem]">{subtitle}</p>

        <div className="mt-8">
          <PortalCarouselSlideshow variant={variant} />
        </div>

        <ul className="mt-6 max-w-md space-y-2.5 text-sm font-medium leading-snug text-cyan-50/95 md:text-[0.95rem]">
          {bullets.map((line) => (
            <li key={line} className="flex gap-2">
              <span className="shrink-0 text-amber-300" aria-hidden>
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
