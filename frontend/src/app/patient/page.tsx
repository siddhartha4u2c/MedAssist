"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getStoredUserJson } from "@/lib/auth-storage";

type PortalCard = {
  href: string;
  title: string;
  description: string;
};

const PORTAL_SECTIONS: PortalCard[] = [
  {
    href: "/patient/symptom-tracker",
    title: "Symptom tracker",
    description:
      "Describe how you feel in a structured way. Your notes can help your care team understand changes over time.",
  },
  {
    href: "/patient/appointments",
    title: "Appointments",
    description:
      "View upcoming visits, book new appointments when available, and join telemedicine sessions from one place.",
  },
  {
    href: "/patient/vitals",
    title: "Vitals",
    description:
      "Record and review blood pressure, heart rate, temperature, and other measurements to build a clearer picture of your day-to-day health.",
  },
  {
    href: "/patient/profile",
    title: "Profile & history",
    description:
      "Keep your personal details, emergency contacts, allergies, and medical history up to date for safer, more informed care.",
  },
  {
    href: "/patient/billing",
    title: "Billing details",
    description:
      "Submit payment requests for review and track approval status when your organisation uses this workflow.",
  },
  {
    href: "/patient/reports",
    title: "Medical reports",
    description:
      "Upload lab results, imaging, or documents for analysis, save short text summaries, and download patient-friendly explanations when ready.",
  },
  {
    href: "/patient/medications",
    title: "Medications",
    description:
      "Maintain a structured list of medicines you take, including how often you take them and notes from your clinicians.",
  },
  {
    href: "/patient/ai-assistant",
    title: "AI assistant",
    description:
      "Ask general health questions in plain language. Use it for education and preparation—always follow your clinician’s advice for decisions about your care.",
  },
  {
    href: "/patient/care-plan",
    title: "Care plan",
    description:
      "Review goals, activities, and follow-up items that you and your care team have agreed on.",
  },
];

export default function PatientOverviewPage() {
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    try {
      const raw = getStoredUserJson();
      if (!raw) return;
      const u = JSON.parse(raw) as { first_name?: string; email?: string };
      const first = (u.first_name || "").trim();
      setDisplayName(first || (u.email || "").split("@")[0] || "");
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-clinical-50/40 to-white p-8 shadow-sm md:p-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
          Welcome to MedAssist
        </h1>
        {displayName ? (
          <p className="mt-2 text-lg text-slate-700">
            Hello, <span className="font-medium text-slate-900">{displayName}</span>.
          </p>
        ) : null}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
          MedAssist brings together the tools you use between visits: symptoms, vitals, reports,
          medications, scheduling, billing, and a guided assistant—all in one secure workspace.
        </p>
      </header>

      <section aria-labelledby="portal-facilities-heading">
        <div className="mb-5 flex flex-col gap-1 border-b border-slate-200 pb-4">
          <h2 id="portal-facilities-heading" className="text-lg font-semibold text-slate-900">
            Your care facilities
          </h2>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {PORTAL_SECTIONS.map((item) => (
            <li key={item.href}>
              <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <Link
                  href={item.href}
                  className="text-sm font-semibold text-clinical-800 underline-offset-2 hover:text-clinical-950 hover:underline"
                >
                  {item.title}
                </Link>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-xl border border-amber-100 bg-amber-50/60 p-5 md:p-6"
        aria-labelledby="portal-safety-heading"
      >
        <h2 id="portal-safety-heading" className="text-sm font-semibold text-amber-950">
          Safety and scope
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-amber-950/90">
          <li>
            If you have severe or sudden symptoms—such as chest pain, trouble breathing, weakness on
            one side, or loss of consciousness—call your local emergency number or go to the nearest
            emergency department.
          </li>
          <li>
            Information in MedAssist is for coordination and education with your care team. It may
            not reflect every detail of your record elsewhere.
          </li>
          <li>
            Use notifications and messages from your team as prompts; always confirm important
            changes with a qualified professional.
          </li>
        </ul>
      </section>
    </div>
  );
}
