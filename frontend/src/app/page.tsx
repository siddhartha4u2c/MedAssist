import type { ReactNode } from "react";
import Link from "next/link";

import { HomeHeroMarquee } from "@/components/landing/home-hero-marquee";
import { ViewportThemeToggle } from "@/components/layout/viewport-theme-toggle";
import { LeadCaptureModal } from "@/components/lead-capture-modal";

function IconRing({ children, tone }: { children: ReactNode; tone: "teal" | "blue" | "amber" | "rose" }) {
  const map = {
    teal: "from-teal-500 to-cyan-600",
    blue: "from-sky-600 to-blue-700",
    amber: "from-amber-400 to-orange-500",
    rose: "from-rose-500 to-pink-600",
  } as const;
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${map[tone]} text-white shadow-md`}
    >
      {children}
    </div>
  );
}

const WHY_CARDS = [
  {
    tone: "teal" as const,
    title: "Guided symptom support",
    body:
      "Structured interviews, urgency awareness, and clear next steps so you know when self-care is reasonable and when to seek emergency care.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tone: "blue" as const,
    title: "Reports you can understand",
    body:
      "Upload labs, imaging, or PDFs—or add a short text summary—and receive plain-language highlights where analysis is enabled for your organisation.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" strokeLinejoin="round" />
        <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    tone: "amber" as const,
    title: "Vitals & monitoring",
    body:
      "Record readings, spot trends, and give your care team a continuous view when remote monitoring programmes are active.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M3 12h4l2-7 4 14 2-7h6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    tone: "rose" as const,
    title: "Safer prescribing workflows",
    body:
      "For clinicians: interaction checks, duplication awareness, and documentation support that speeds review while keeping humans in control.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" strokeLinejoin="round" />
        <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <main className="relative min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <ViewportThemeToggle />
      <LeadCaptureModal />

      {/* Top bar — Narayana-style utility strip */}
      <div className="border-b border-slate-200/80 bg-slate-50 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl text-center text-slate-600 dark:text-slate-400 md:text-left">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Telemedicine · Remote monitoring · Secure clinical workspace
          </span>
        </div>
      </div>

      {/* Hero — Apollo-style gradient + Narayana-style headline hierarchy */}
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-500 via-cyan-600 to-blue-900 px-4 pb-14 pt-10 md:px-8 md:pb-16 md:pt-14">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-amber-300/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-white/10 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-cyan-100/90">
              MedAssist AI
            </p>
            <h1 className="mt-3 text-balance text-3xl font-bold leading-tight tracking-tight text-white md:text-4xl lg:text-[2.65rem] lg:leading-[1.12]">
              <span className="text-amber-300">Care that connects</span>{" "}
              <span className="text-white/95">your symptoms, reports, and team</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-cyan-50/95 md:text-lg">
              One unified, professional workspace for patients and clinicians—telemedicine-ready,
              monitoring-aware, and built so important decisions stay with qualified professionals.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm font-medium text-cyan-50 md:text-[0.95rem]">
              <li className="flex gap-2">
                <span className="text-amber-300" aria-hidden>
                  ✓
                </span>
                Structured symptom journeys and report interpretation support
              </li>
              <li className="flex gap-2">
                <span className="text-amber-300" aria-hidden>
                  ✓
                </span>
                Vitals, medications, appointments, care plans, and billing in one flow
              </li>
              <li className="flex gap-2">
                <span className="text-amber-300" aria-hidden>
                  ✓
                </span>
                Assistant chat for education—never a substitute for your own clinician
              </li>
            </ul>
          </div>

          {/* Access card — Apollo-style white panel */}
          <div className="relative rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-700 md:p-8">
            <div className="absolute -right-3 -top-3 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-md">
              Secure
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Access your portal</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              New patients and providers can request access below—approval may be required by your
              administrator.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/login"
                className="block rounded-xl bg-gradient-to-r from-[#0c4a6e] to-[#0369a1] py-3.5 text-center text-sm font-bold text-white shadow-md transition hover:from-[#0a3d5c] hover:to-[#0284c7]"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="block rounded-xl border-2 border-teal-600 bg-teal-50 py-3.5 text-center text-sm font-bold text-teal-900 transition hover:bg-teal-100 dark:border-teal-500 dark:bg-slate-800 dark:text-teal-100 dark:hover:bg-slate-700"
              >
                Register for access
              </Link>
            </div>
            <p className="mt-5 border-t border-slate-100 pt-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Emergency? Call your local emergency number immediately.
            </p>
          </div>
        </div>
      </section>

      {/* Marquee ribbon — deep band like a hero footer */}
      <div className="border-t border-white/10 bg-gradient-to-b from-[#041526] via-[#0a2544] to-[#061a33] py-8 dark:border-slate-800">
        <p className="mb-5 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200/80">
          Care in motion
        </p>
        <HomeHeroMarquee className="border-0 bg-transparent py-0" />
      </div>

      {/* Why section — Apollo-style cards */}
      <section
        className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-14 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 md:px-8"
        aria-labelledby="why-heading"
      >
        <div className="mx-auto max-w-6xl">
          <h2
            id="why-heading"
            className="text-center text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl"
          >
            Why choose MedAssist?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400 md:text-base">
            Purpose-built capabilities for modern telemedicine and continuous care—presented clearly for
            patients and the professionals who support them.
          </p>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_CARDS.map((c) => (
              <li
                key={c.title}
                className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-teal-700"
              >
                <IconRing tone={c.tone}>{c.icon}</IconRing>
                <h3 className="mt-4 text-base font-bold text-slate-900 dark:text-white">{c.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {c.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Detail columns */}
      <section className="px-4 py-12 md:px-8" aria-labelledby="detail-heading">
        <div className="mx-auto max-w-6xl">
          <h2 id="detail-heading" className="text-center text-lg font-bold text-slate-900 dark:text-white">
            For patients &amp; care teams
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-6 dark:border-teal-900/50 dark:bg-teal-950/20">
              <h3 className="text-sm font-bold uppercase tracking-wide text-teal-800 dark:text-teal-300">
                Patients
              </h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                <li>Symptom guidance with clear escalation guidance when patterns look urgent.</li>
                <li>Upload reports or add text summaries; receive patient-friendly explanations when enabled.</li>
                <li>Track vitals, medications, appointments, care plans, and billing requests in one place.</li>
                <li>Use the assistant for general education—not for diagnosis or emergency triage.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-6 dark:border-blue-900/50 dark:bg-blue-950/20">
              <h3 className="text-sm font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                Doctors &amp; teams
              </h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                <li>Fast triage and prioritisation using structured patient inputs and vitals.</li>
                <li>Consolidated report views with extracted values to speed chart review.</li>
                <li>Medication safety checks, monitoring dashboards, and configurable alerts.</li>
                <li>Care-plan drafting, follow-up reminders, and optional voice-to-note support you approve.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
