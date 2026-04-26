"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** In-app notification row (wire to API / events later). */
export type PortalNotificationItem = {
  id: string;
  title: string;
  body?: string;
  createdAt: string;
  read?: boolean;
  patientUserId?: string;
};

type Props = {
  /** Pass items when notification sources exist; omit for empty panel. */
  notifications?: PortalNotificationItem[];
  /** Mark a notification read when the user opens it (e.g. doctor inbox). */
  onMarkRead?: (id: string) => void | Promise<void>;
  /** Build a link to the patient chart when `patientUserId` is set. */
  patientHref?: (patientUserId: string) => string;
};

function BellIcon({ className }: { className?: string }) {
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
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function PortalNotificationBell({
  notifications = [],
  onMarkRead,
  patientHref,
}: Props) {
  const [open, setOpen] = useState(false);
  const [optimisticReadIds, setOptimisticReadIds] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const isRead = (n: PortalNotificationItem) => Boolean(n.read || optimisticReadIds.has(n.id));
  const unread = notifications.filter((n) => !isRead(n)).length;

  useEffect(() => {
    // Keep optimistic read IDs only for notifications that are still unread from server.
    setOptimisticReadIds((prev) => {
      if (prev.size === 0) return prev;
      const unreadServerIds = new Set(notifications.filter((n) => !n.read).map((n) => n.id));
      const next = new Set<string>();
      for (const id of Array.from(prev)) {
        if (unreadServerIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [notifications]);

  function markReadLocal(id: string) {
    setOptimisticReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (onMarkRead) void onMarkRead(id);
  }

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon className="h-[1.15rem] w-[1.15rem]" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-clinical-600 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[min(100vw-2rem,22rem)] rounded-xl border border-slate-200 bg-white py-2 shadow-lg"
          role="dialog"
          aria-label="Notification list"
        >
          <div className="border-b border-slate-100 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notifications
            </p>
          </div>
          <div className="max-h-[min(70vh,20rem)] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8" aria-hidden />
            ) : (
              <ul className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={
                      isRead(n)
                        ? "px-4 py-3 text-left"
                        : "bg-clinical-50/50 px-4 py-3 text-left"
                    }
                  >
                    <div
                      className="cursor-default"
                      role="presentation"
                      onClick={() => {
                        if (!isRead(n)) markReadLocal(n.id);
                      }}
                    >
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      {n.body ? (
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-slate-600 line-clamp-6">
                          {n.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-slate-400">{n.createdAt}</p>
                    </div>
                    {n.patientUserId && patientHref ? (
                      <p className="mt-2">
                        <Link
                          href={patientHref(n.patientUserId)}
                          className="text-xs font-medium text-clinical-700 hover:underline"
                          onClick={() => {
                            if (!isRead(n)) markReadLocal(n.id);
                          }}
                        >
                          Open patient
                        </Link>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
