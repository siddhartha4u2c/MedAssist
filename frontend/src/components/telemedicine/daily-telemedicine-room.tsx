"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ANNOUNCEMENT = "This call is being recorded.";

function speakRecordingNotice() {
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(ANNOUNCEMENT);
    u.lang = "en-US";
    u.rate = 0.92;
    synth.speak(u);
  } catch {
    /* ignore */
  }
}

/** Minimal Daily call handle for Prebuilt iframe (recording events + join/destroy). */
type DailyFrame = {
  on: (ev: string, fn: () => void) => void;
  off?: (ev: string, fn: () => void) => void;
  join: (opts: { url: string }) => Promise<void>;
  destroy: () => void;
};

export function DailyTelemedicineRoom({ roomUrl }: { roomUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [recordingActive, setRecordingActive] = useState(false);

  const onRecordingStarted = useCallback(() => {
    setRecordingActive(true);
    speakRecordingNotice();
  }, []);

  const onRecordingStopped = useCallback(() => {
    setRecordingActive(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || !roomUrl) return;

    let frame: DailyFrame | null = null;
    let cancelled = false;

    void (async () => {
      const DailyIframe = (await import("@daily-co/daily-js")).default;
      if (cancelled || !hostRef.current) return;

      frame = DailyIframe.createFrame(hostRef.current, {
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "0",
          borderRadius: "8px",
        },
        showLeaveButton: true,
      }) as unknown as DailyFrame;

      frame.on("recording-started", onRecordingStarted);
      frame.on("recording-stopped", onRecordingStopped);

      try {
        await frame.join({ url: roomUrl });
      } catch (e) {
        console.error("[Daily] join failed", e);
      }
    })();

    return () => {
      cancelled = true;
      if (!frame) return;
      try {
        frame.off?.("recording-started", onRecordingStarted);
        frame.off?.("recording-stopped", onRecordingStopped);
        frame.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [roomUrl, onRecordingStarted, onRecordingStopped]);

  return (
    <div className="flex flex-col gap-2">
      {recordingActive ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-950"
          role="status"
          aria-live="polite"
        >
          {ANNOUNCEMENT}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="h-[min(85vh,760px)] w-full min-h-[420px] overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
      />
    </div>
  );
}
