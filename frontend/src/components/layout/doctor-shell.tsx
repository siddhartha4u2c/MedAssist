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

function formatNotifWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

const DOCTOR_NAV = [
  { href: "/doctor/patients", label: "My patients" },
  { href: "/doctor/appointments", label: "Appointments" },
  { href: "/doctor/profile", label: "Professional profile" },
] as const;

export function DoctorShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
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
    void loadNotifications();
    const id = window.setInterval(() => void loadNotifications(), 45_000);
    return () => window.clearInterval(id);
  }, [loadNotifications, pathname]);

  async function onMarkNotificationRead(id: string) {
    try {
      await markPortalNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      /* ignore */
    }
  }

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
        if (u.role && u.role !== "doctor") {
          router.replace(u.role === "admin" ? "/admin" : "/patient");
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [router]);

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
        <div className="flex h-14 min-w-0 items-center justify-between gap-3 px-4 md:px-6">
          <Link
            href="/doctor/patients"
            className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-900"
          >
            MedAssist AI — Doctor
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <PortalNotificationBell
              notifications={notifications}
              onMarkRead={(id) => void onMarkNotificationRead(id)}
              patientHref={(patientUserId) =>
                `/doctor/patients/${encodeURIComponent(patientUserId)}`
              }
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
              {DOCTOR_NAV.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
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
