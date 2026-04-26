"use client";

import { useMemo, useRef, useState } from "react";
import {
  errorMessageFromUnknown,
  patientAssistantChat,
  type SymptomChatMessage,
} from "@/lib/api-client";

type LanguageOption = { code: string; label: string };

const LANG_OPTIONS: LanguageOption[] = [
  { code: "auto", label: "Auto detect" },
  { code: "en-US", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "or-IN", label: "Odia" },
  { code: "as-IN", label: "Assamese" },
  { code: "ur-IN", label: "Urdu" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "ar-SA", label: "Arabic" },
];

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionWithStatics = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionWithStatics;
    SpeechRecognition?: SpeechRecognitionWithStatics;
  }
}

function mapLocaleForBackend(code: string): string {
  if (!code || code === "auto") return "auto";
  const i = code.indexOf("-");
  return i > 0 ? code.slice(0, i) : code;
}

function textForSpeech(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";
  // Remove fenced code blocks and inline code markers.
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  // Remove markdown headings / bullets / emphasis markers.
  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");
  t = t.replace(/[*_~]/g, "");
  // Remove link markdown but keep anchor text.
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  // Collapse punctuation artifacts and spaces.
  t = t.replace(/[•▪◦]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export default function PatientAiAssistantPage() {
  const [messages, setMessages] = useState<SymptomChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello. I am your MedAssist AI Assistant. Ask in any language by text or voice, and I will respond in the same language with comprehensive guidance.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<string>("auto");
  const [voiceReplyOn, setVoiceReplyOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [lastAssistantReply, setLastAssistantReply] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const lastSpokenRef = useRef("");

  const canUseSpeechRecognition = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }, []);

  function speakReply(text: string, force = false) {
    if ((!voiceReplyOn && !force) || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const t = textForSpeech(text);
    if (!t) return;
    const synth = window.speechSynthesis;
    const langBase = (lang === "auto" ? "" : lang.split("-")[0]).toLowerCase();
    const candidates: Array<{ lang?: string; voice?: SpeechSynthesisVoice }> = [];
    try {
      const voices = synth.getVoices() || [];
      if (lang !== "auto") {
        const exact = voices.find((x) => (x.lang || "").toLowerCase() === lang.toLowerCase());
        const base = voices.find((x) => (x.lang || "").toLowerCase().startsWith(langBase));
        if (exact) candidates.push({ lang, voice: exact });
        if (base && base !== exact) candidates.push({ lang, voice: base });
        candidates.push({ lang });
        candidates.push({ lang: langBase || undefined });
      }
      candidates.push({}); // browser default voice/lang as last fallback
    } catch {
      candidates.push({});
    }
    let idx = 0;
    const trySpeak = () => {
      const c = candidates[idx] || {};
      const utt = new SpeechSynthesisUtterance(t.slice(0, 3500));
      if (c.lang) utt.lang = c.lang;
      if (c.voice) utt.voice = c.voice;
      utt.onstart = () => {
        setSpeaking(true);
        setError("");
      };
      utt.onend = () => {
        setSpeaking(false);
        lastSpokenRef.current = t;
      };
      utt.onerror = () => {
        idx += 1;
        if (idx < candidates.length) {
          trySpeak();
          return;
        }
        setSpeaking(false);
        setError(
          "Could not play voice reply for this language in your browser. Text response is available."
        );
      };
      try {
        synth.cancel();
        synth.speak(utt);
      } catch {
        idx += 1;
        if (idx < candidates.length) {
          trySpeak();
          return;
        }
        setSpeaking(false);
        setError("Voice reply failed in this browser. Text response is still available.");
      }
    };
    trySpeak();
  }

  async function sendMessage(explicitText?: string) {
    const text = (explicitText ?? input).trim();
    if (!text || loading) return;
    setError("");
    if (explicitText === undefined) setInput("");
    const thread = [...messages, { role: "user", content: text } as SymptomChatMessage];
    setMessages(thread);
    setLoading(true);
    try {
      const res = await patientAssistantChat(thread, { locale: mapLocaleForBackend(lang) });
      const reply = (res.reply || "").trim() || "I could not generate a reply. Please try again.";
      setLastAssistantReply(reply);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      speakReply(reply);
      queueMicrotask(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setError(errorMessageFromUnknown(e));
      setMessages((prev) => prev.slice(0, -1));
      if (explicitText === undefined) setInput(text);
    } finally {
      setLoading(false);
    }
  }

  function stopListening() {
    const r = recognitionRef.current;
    if (r) {
      r.onend = null;
      r.stop();
      recognitionRef.current = null;
    }
    setRecording(false);
  }

  function startListening() {
    if (!canUseSpeechRecognition || loading) return;
    setError("");
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang === "auto" ? "en-US" : lang;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let finalTranscript = "";
    rec.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        const txt = result[0]?.transcript || "";
        if (result.isFinal) finalTranscript += txt + " ";
        else interim += txt;
      }
      setInput((finalTranscript + interim).trim());
    };
    rec.onerror = () => {
      setError("Voice capture failed. Please try again or use text input.");
      setRecording(false);
    };
    rec.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
      const t = finalTranscript.trim() || input.trim();
      if (t) void sendMessage(t);
    };
    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h1 className="text-xl font-semibold text-slate-900">AI Assistant</h1>
      <p className="mt-2 text-sm text-slate-600">
        Voice-enabled multilingual assistant for general health questions.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-slate-700">
          Input language
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            disabled={loading || recording}
          >
            {LANG_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 sm:pt-5">
          <input
            type="checkbox"
            checked={voiceReplyOn}
            onChange={(e) => setVoiceReplyOn(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Speak assistant replies
        </label>
        <div className="flex items-center gap-2 text-xs text-slate-600 sm:pt-5">
          {!canUseSpeechRecognition ? <span>Voice input not supported in this browser</span> : null}
          <button
            type="button"
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            disabled={!lastAssistantReply || speaking}
            onClick={() => speakReply(lastAssistantReply, true)}
            title="Replay the last assistant message"
          >
            {speaking ? "Speaking…" : "Speak last reply"}
          </button>
        </div>
      </div>

      <div className="mt-4 h-[min(58vh,34rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md bg-clinical-600 px-3 py-2 text-sm text-white"
                    : "max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                }
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                Thinking…
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
      >
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your health question…"
            rows={3}
            className="min-h-[3rem] flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-clinical-500 focus:outline-none focus:ring-1 focus:ring-clinical-500"
            disabled={loading}
          />
          <div className="flex flex-col gap-2 self-end">
            <button
              type="button"
              onClick={() => (recording ? stopListening() : startListening())}
              disabled={!canUseSpeechRecognition || loading}
              className={`rounded-lg px-3 py-2 text-xs font-medium text-white disabled:opacity-50 ${
                recording ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-700 hover:bg-slate-800"
              }`}
            >
              {recording ? "Stop mic" : "Voice"}
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
