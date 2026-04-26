"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Fixed top-right of the viewport (safe-area aware) for public / auth pages. */
export function ViewportThemeToggle() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-end p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]"
    >
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
