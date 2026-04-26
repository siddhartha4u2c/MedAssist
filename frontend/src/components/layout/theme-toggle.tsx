"use client";

import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme-constants";

function applyDark(on: boolean) {
  const root = document.documentElement;
  if (on) root.classList.add("dark");
  else root.classList.remove("dark");
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

type Props = { className?: string };

export function ThemeToggle({ className }: Props) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    applyDark(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* ignore */
    }
    setDark(next);
  }

  if (!mounted) {
    return <span className={`inline-flex h-9 w-9 shrink-0 ${className ?? ""}`} aria-hidden />;
  }

  return (
    <button
      type="button"
      data-app-theme-control
      onClick={toggle}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 ${className ?? ""}`}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      {dark ? <SunIcon className="h-[1.15rem] w-[1.15rem]" /> : <MoonIcon className="h-[1.15rem] w-[1.15rem]" />}
    </button>
  );
}
