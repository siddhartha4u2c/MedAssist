"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  fetchPortalNotifications,
  markPortalNotificationRead,
} from "@/lib/api-client";
import { clearPortalSession, getStoredAccessToken, getStoredUserJson } from "@/lib/auth-storage";
import { PortalLogoutCorner } from "@/components/layout/portal-logout-corner";
import {
  PortalNotificationBell,
  type PortalNotificationItem,
} from "@/components/layout/portal-notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const PATIENT_NAV = [
  { href: "/patient", label: "Overview" },
  { href: "/patient/symptom-tracker", label: "Symptom tracker" },
  { href: "/patient/appointments", label: "Appointments" },
  { href: "/patient/vitals", label: "Vitals" },
  { href: "/patient/profile", label: "Profile" },
  { href: "/patient/billing", label: "Billing details" },
  { href: "/patient/reports", label: "Reports" },
  { href: "/patient/medications", label: "Medications" },
  { href: "/patient/ai-assistant", label: "AI Assistant" },
  { href: "/patient/care-plan", label: "Care plan" },
] as const;

type AssignedDoctorChip = { displayName: string; email?: string };

function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!base) return `/api/v1/${path.replace(/^\/+/, "")}`;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

function formatNotifWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function PatientShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [assignedDoctor, setAssignedDoctor] = useState<AssignedDoctorChip | null>(null);
  const [notifications, setNotifications] = useState<PortalNotificationItem[]>([]);

  const loadNotifications = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    try {
      const d = await fetchPortalNotifications();
      setNotifications(
        d.notifications.map((r) => ({
          id: r.id,
          title: r.title,
          body: r.body || undefined,
          read: r.read,
          patientUserId: r.patientUserId || undefined,
          createdAt: formatNotifWhen(r.createdAt),
        }))
      );
    } catch {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const raw = getStoredUserJson();
      if (raw) {
        const u = JSON.parse(raw) as { email?: string; first_name?: string; role?: string };
        if (u.role === "doctor") {
          router.replace("/doctor/patients");
          return;
        }
        if (u.role === "admin") {
          router.replace("/admin");
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    void loadNotifications();
    const id = window.setInterval(() => void loadNotifications(), 45_000);
    return () => window.clearInterval(id);
  }, [ready, loadNotifications, pathname]);

  useEffect(() => {
    if (!ready) return;
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("patient/profile"), {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as {
          profile?: { assignedDoctor?: { displayName?: string; email?: string } | null } | null;
        };
        if (cancelled || !res.ok) return;
        const ad = data.profile?.assignedDoctor;
        const name = (ad?.displayName || "").trim();
        if (name) {
          setAssignedDoctor({ displayName: name, email: (ad?.email || "").trim() || undefined });
        } else {
          setAssignedDoctor(null);
        }
      } catch {
        if (!cancelled) setAssignedDoctor(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  async function onMarkNotificationRead(id: string) {
    try {
      await markPortalNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      /* ignore */
    }
  }

  function signOut() {
    clearPortalSession();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="z-10 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-14 min-w-0 items-center justify-between gap-2 px-4 md:gap-3 md:px-6">
          <Link
            href="/patient"
            className="min-w-0 shrink truncate text-sm font-semibold tracking-tight text-slate-900"
          >
            MedAssist AI
          </Link>
          <div className="flex min-w-0 max-w-[65%] flex-1 items-center justify-end gap-2 sm:max-w-[72%] sm:gap-3 md:max-w-none md:flex-none">
            {assignedDoctor ? (
              <div
                className="min-w-0 max-w-[36vw] rounded-lg border border-slate-200/90 bg-slate-50 px-2 py-1 text-right shadow-sm sm:max-w-[13rem] sm:px-2.5"
                title={assignedDoctor.email ? `Email: ${assignedDoctor.email}` : undefined}
                aria-label={`Assigned doctor: ${assignedDoctor.displayName}`}
              >
                <p className="text-[0.6rem] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:text-[0.65rem]">
                  Assigned doctor
                </p>
                <p className="truncate text-[0.7rem] font-medium leading-tight text-slate-800 sm:text-xs">
                  {assignedDoctor.displayName}
                </p>
              </div>
            ) : null}
            <PortalNotificationBell
              notifications={notifications}
              onMarkRead={(id) => void onMarkNotificationRead(id)}
            />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white sm:w-52 sm:border-b-0 sm:border-r md:sticky md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56">
          <nav
            className="max-h-[40vh] overflow-y-auto p-2 sm:max-h-none sm:p-3"
            aria-label="Main navigation"
          >
            <ul className="flex flex-col gap-0.5">
              {PATIENT_NAV.map((item) => {
                const active =
                  item.href === "/patient"
                    ? pathname === "/patient"
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={
                        active
                          ? "block rounded-lg bg-clinical-50 px-3 py-2.5 text-sm font-medium text-clinical-900"
                          : "block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 pb-20 md:p-8 md:pb-24">
          {children}
        </main>
      </div>
      <PortalLogoutCorner onLogout={signOut} />
    </div>
  );
}
