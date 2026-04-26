"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearPortalSession, getStoredAccessToken, getStoredUserJson } from "@/lib/auth-storage";
import { PortalLogoutCorner } from "@/components/layout/portal-logout-corner";
import { PortalNotificationBell } from "@/components/layout/portal-notification-bell";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
        if (u.role && u.role !== "admin") {
          router.replace(u.role === "doctor" ? "/doctor/patients" : "/patient");
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [router]);

  function logOut() {
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
            href="/admin"
            className="min-w-0 truncate text-sm font-semibold tracking-tight text-slate-900"
          >
            MedAssist AI — Admin
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <PortalNotificationBell />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col pb-20 md:pb-24">{children}</main>
      <PortalLogoutCorner onLogout={logOut} />
    </div>
  );
}
