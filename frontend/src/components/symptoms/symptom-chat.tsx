"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorMessageFromUnknown,
  fetchSymptomTrackerInfo,
  symptomChat,
  type SymptomAssessment,
  type SymptomChatMessage,
} from "@/lib/api-client";
import {
  appendCompletedSession,
  clearCurrentTabMessages,
  loadCurrentTabMessages,
  loadPastSessions,
  saveCurrentTabMessages,
  type StoredSymptomSession,
} from "./symptom-session-storage";

function bubbleClass(role: "user" | "assistant"): string {
  if (role === "user") {
    return "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-clinical-600 px-4 py-2.5 text-sm text-white";
  }
  return "mr-auto max-w-[85%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm";
}

function isCriticalUrgency(a: SymptomAssessment): boolean {
  const L = (a.urgencyLevel || "").toLowerCase();
  return L === "emergency" || L === "very_urgent";
}

function isHighUrgencyBanner(a: SymptomAssessment): boolean {
  if (isCriticalUrgency(a)) return true;
  const L = (a.urgencyLevel || "").toLowerCase();
  if (L === "urgent" && a.urgencyScore >= 8) return true;
  const see = (a.seeDoctorWithin || "").toLowerCase();
  if (see === "immediate") return true;
  return false;
}

function sessionPreview(messages: SymptomChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (firstUser?.content?.trim()) {
    const t = firstUser.content.trim();
    return t.length > 56 ? `${t.slice(0, 54)}…` : t;
  }
  return "Session";
}

export function SymptomChat() {
  const [messages, setMessages] = useState<SymptomChatMessage[]>(() => loadCurrentTabMessages());
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connectionHint, setConnectionHint] = useState("");
  const [ragHint, setRagHint] = useState("");
  const [pastSessions, setPastSessions] = useState<StoredSymptomSession[]>([]);
  const [latestAssessment, setLatestAssessment] = useState<SymptomAssessment | null>(null);
  const [urgentModalOpen, setUrgentModalOpen] = useState(false);
  /** Dismissed sticky alert for a given assessment "version" (level+score+seeDoctor). */
  const [dismissedSeverityKey, setDismissedSeverityKey] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<SymptomChatMessage[]>(messages);
  const flushLockRef = useRef(false);
  /** Avoid flushing on React Strict Mode’s immediate dev unmount (session stays in sessionStorage). */
  const allowUnmountFlushRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    saveCurrentTabMessages(messages);
  }, [messages]);

  useEffect(() => {
    setPastSessions(loadPastSessions());
  }, []);

  const flushSessionToHistory = useCallback(() => {
    if (flushLockRef.current) return;
    const snapshot = messagesRef.current;
    if (snapshot.length === 0) {
      clearCurrentTabMessages();
      return;
    }
    flushLockRef.current = true;
    try {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `symptom-${Date.now()}`;
      const session: StoredSymptomSession = {
        id,
        endedAt: Date.now(),
        messages: snapshot.map((m) => ({ ...m })),
      };
      const next = appendCompletedSession(session);
      setPastSessions(next);
      setMessages([]);
      messagesRef.current = [];
      clearCurrentTabMessages();
    } finally {
      window.setTimeout(() => {
        flushLockRef.current = false;
      }, 400);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      allowUnmountFlushRef.current = true;
    }, 300);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushSessionToHistory();
      }
    };
    const onPageHide = () => {
      flushSessionToHistory();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushSessionToHistory]);

  useEffect(() => {
    return () => {
      if (allowUnmountFlushRef.current) {
        flushSessionToHistory();
      }
    };
  }, [flushSessionToHistory]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchSymptomTrackerInfo();
        if (cancelled) return;
        if (info.service !== "medassist") {
          setConnectionHint("API proxy is not reaching MedAssist Flask (wrong service response).");
          return;
        }
        if (!info.llm_configured) {
          setConnectionHint(
            "LLM is not configured on the server (set EURI_API_KEY in backend/.env and restart Flask)."
          );
          setRagHint("");
          return;
        }
        setConnectionHint("");
        if (info.rag_configured === false) {
          setRagHint(
            "Pinecone medical RAG is off. Set PINECONE_API_KEY and PINECONE_INDEX_NAME in backend/.env for retrieved knowledge passages."
          );
        } else {
          setRagHint("");
        }
      } catch (err) {
        if (cancelled) return;
        setConnectionHint(errorMessageFromUnknown(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setError("");
    setInput("");
    const userMsg: SymptomChatMessage = { role: "user", content: text };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    setLoading(true);
    try {
      const { reply, assessment } = await symptomChat(nextThread);
      const trimmed = (reply || "").trim();
      setLatestAssessment(assessment);
      setDismissedSeverityKey(null);
      if (isCriticalUrgency(assessment)) {
        setUrgentModalOpen(true);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: trimmed || "I could not generate a reply. Please try again." },
      ]);
    } catch (err) {
      let msg = errorMessageFromUnknown(err);
      if (/NOT_FOUND|Resource not found/i.test(msg)) {
        msg +=
          " Usually this means the browser is not hitting MedAssist Flask: restart `npm run dev`, confirm BACKEND_URL in frontend/.env.local points to Flask (port 5000), and open this app on the same host/port Next prints (e.g. localhost:3000 vs 3001).";
      }
      setError(msg);
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }

  const severityAlertKey = latestAssessment
    ? `${latestAssessment.urgencyLevel}-${latestAssessment.urgencyScore}-${latestAssessment.seeDoctorWithin}`
    : null;
  const showSeverityAlert =
    latestAssessment !== null &&
    severityAlertKey !== null &&
    isHighUrgencyBanner(latestAssessment) &&
    severityAlertKey !== dismissedSeverityKey;

  return (
    <div className="relative flex h-[min(32rem,calc(100vh-11rem))] min-h-[20rem] flex-col rounded-xl border border-slate-200 bg-white shadow-sm md:h-[min(40rem,calc(100vh-10rem))]">
      {urgentModalOpen ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center rounded-xl bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="urgent-modal-title"
          aria-describedby="urgent-modal-desc"
        >
          <div className="max-h-[90%] w-full max-w-md overflow-y-auto rounded-2xl border-4 border-red-600 bg-red-600 p-5 text-white shadow-2xl ring-4 ring-red-300/80">
            <h2 id="urgent-modal-title" className="text-xl font-black tracking-tight">
              {latestAssessment?.urgencyLevel?.toLowerCase() === "emergency"
                ? "Emergency — seek care now"
                : "Seek medical care now"}
            </h2>
            <p id="urgent-modal-desc" className="mt-3 text-sm font-semibold leading-relaxed">
              Your symptoms may be <span className="underline">very urgent or an emergency</span>.
              This assistant is not a substitute for a clinician.{" "}
              <strong className="block pt-2 text-base">
                Contact a doctor or emergency services immediately.
              </strong>
            </p>
            {latestAssessment?.urgencyLabel ? (
              <p className="mt-3 rounded-lg bg-red-950/40 px-3 py-2 text-sm font-medium">{latestAssessment.urgencyLabel}</p>
            ) : null}
            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-red-700 shadow hover:bg-red-50"
              onClick={() => setUrgentModalOpen(false)}
            >
              I understand — continue (not a substitute for care)
            </button>
          </div>
        </div>
      ) : null}
      <div className="border-b border-slate-100 px-4 py-3 md:px-5">
        <h1 className="text-base font-semibold text-slate-900">Symptom tracker</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          Chat with the Symptom Analyst for a structured interview. Not a substitute for emergency
          care or a clinician.
        </p>
        {connectionHint ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{connectionHint}</p>
        ) : null}
        {ragHint && !connectionHint ? (
          <p className="mt-2 text-xs text-slate-500">{ragHint}</p>
        ) : null}

        {pastSessions.length > 0 ? (
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-slate-700">
              Recent sessions ({pastSessions.length})
            </summary>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-xs text-slate-600">
              {pastSessions.map((s) => (
                <li key={s.id} className="rounded-md border border-slate-100 bg-white px-2 py-1.5">
                  <div className="font-medium text-slate-800">
                    {new Date(s.endedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>
                  <div className="text-slate-500">{sessionPreview(s.messages)}</div>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-clinical-700 hover:underline">
                      View transcript
                    </summary>
                    <div className="mt-1 max-h-32 space-y-1 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-[11px] leading-snug">
                      {s.messages.map((m, i) => (
                        <p key={i}>
                          <span className="font-semibold text-slate-700">
                            {m.role === "user" ? "You" : "Assistant"}:
                          </span>{" "}
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        </p>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {showSeverityAlert && latestAssessment ? (
        <div
          className="mx-3 mt-2 shrink-0 rounded-xl border-2 border-red-700 bg-red-600 px-3 py-3 text-white shadow-lg md:mx-4"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-red-100">
                High-urgency warning
              </p>
              <p className="mt-1 text-sm font-semibold leading-snug">
                {(latestAssessment.urgencyLevel || "").toLowerCase() === "emergency"
                  ? "Possible emergency — contact local emergency services or go to the ER if symptoms are severe or worsening."
                  : "Your latest assessment is urgent. Arrange in-person or emergency care as appropriate; this chat is not a substitute for a clinician."}
              </p>
              {latestAssessment.urgencyLabel ? (
                <p className="mt-2 rounded-lg bg-red-950/35 px-2.5 py-1.5 text-xs font-medium leading-snug text-red-50">
                  {latestAssessment.urgencyLabel}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold text-white hover:bg-white/25"
              onClick={() => setDismissedSeverityKey(severityAlertKey)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-5">
        {messages.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <p className="font-medium text-slate-800">How it works</p>
            <p className="mt-1">
              Describe what you feel, answer follow-up questions, and you will get organized
              possibilities and next-step suggestions. If you have severe or sudden symptoms, call
              emergency services.
            </p>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={bubbleClass(m.role)}>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          </div>
        ))}
        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Thinking…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 md:mx-5">
          {error}
        </div>
      ) : null}

      {latestAssessment ? (
        <div className="border-t border-slate-100 bg-slate-50/90 px-3 py-3 md:px-4">
          <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <summary className="cursor-pointer font-semibold text-slate-800">
              Structured assessment — latest reply
            </summary>
            <p className="mt-2 text-[11px] text-slate-500">
              Urgency: <span className="font-mono font-medium text-slate-800">{latestAssessment.urgencyLevel}</span>{" "}
              (score {latestAssessment.urgencyScore}) · see doctor within:{" "}
              <span className="font-mono">{latestAssessment.seeDoctorWithin}</span>
            </p>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-slate-900 p-2 text-[11px] leading-snug text-emerald-100">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(latestAssessment).filter(([k]) => k !== "source")
                ),
                null,
                2
              )}
            </pre>
          </details>
        </div>
      ) : null}

      <form onSubmit={onSend} className="border-t border-slate-100 p-3 md:p-4">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your symptoms…"
            rows={2}
            className="min-h-[2.75rem] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-clinical-600 focus:border-clinical-600 focus:ring-1"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void onSend(e as unknown as React.FormEvent);
              }
            }}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 self-end rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-400">
          MedAssist does not provide medical diagnosis. For emergencies, contact local emergency
          services.
        </p>
      </form>
    </div>
  );
}
