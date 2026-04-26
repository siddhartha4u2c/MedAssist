/**
 * Symptom tracker sessions:
 * - Current tab session: sessionStorage (survives refresh while staying on the tab).
 * - Last 5 completed sessions: localStorage (a session ends when the tab is hidden or you leave the page).
 */

import type { SymptomChatMessage } from "@/lib/api-client";

export const SYMPTOM_CURRENT_TAB_KEY = "medassist_symptom_current_tab_v1";
export const SYMPTOM_SESSIONS_HISTORY_KEY = "medassist_symptom_sessions_v1";
export const MAX_STORED_SESSIONS = 5;

export type StoredSymptomSession = {
  id: string;
  endedAt: number;
  messages: SymptomChatMessage[];
};

function safeParseSessions(raw: string | null): StoredSymptomSession[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (x): x is StoredSymptomSession =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as StoredSymptomSession).id === "string" &&
          typeof (x as StoredSymptomSession).endedAt === "number" &&
          Array.isArray((x as StoredSymptomSession).messages)
      )
      .slice(0, MAX_STORED_SESSIONS);
  } catch {
    return [];
  }
}

export function loadCurrentTabMessages(): SymptomChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(SYMPTOM_CURRENT_TAB_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as { messages?: unknown };
    if (!Array.isArray(p.messages)) return [];
    return p.messages.filter(
      (m): m is SymptomChatMessage =>
        typeof m === "object" &&
        m !== null &&
        (m as SymptomChatMessage).role !== undefined &&
        typeof (m as SymptomChatMessage).content === "string"
    );
  } catch {
    return [];
  }
}

export function saveCurrentTabMessages(messages: SymptomChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SYMPTOM_CURRENT_TAB_KEY, JSON.stringify({ messages }));
  } catch {
    /* quota / private mode */
  }
}

export function clearCurrentTabMessages(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SYMPTOM_CURRENT_TAB_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPastSessions(): StoredSymptomSession[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParseSessions(localStorage.getItem(SYMPTOM_SESSIONS_HISTORY_KEY));
  } catch {
    return [];
  }
}

export function appendCompletedSession(session: StoredSymptomSession): StoredSymptomSession[] {
  if (typeof window === "undefined") return [];
  try {
    const prev = safeParseSessions(localStorage.getItem(SYMPTOM_SESSIONS_HISTORY_KEY));
    const next = [session, ...prev.filter((s) => s.id !== session.id)].slice(
      0,
      MAX_STORED_SESSIONS
    );
    localStorage.setItem(SYMPTOM_SESSIONS_HISTORY_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}
