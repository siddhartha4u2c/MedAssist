"use client";

type Props = {
  onLogout: () => void;
  label?: string;
};

/** Fixed bottom-left — stays visible while scrolling the portal. */
export function PortalLogoutCorner({ onLogout, label = "Log out" }: Props) {
  return (
    <button
      type="button"
      onClick={onLogout}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-[max(1rem,env(safe-area-inset-left,0px))] z-[100] rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-lg hover:bg-slate-50"
    >
      {label}
    </button>
  );
}
