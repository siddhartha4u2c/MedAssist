"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth-storage";

type VitalReading = {
  id: string;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  fastingGlucoseMgDl: number | null;
  ppGlucoseMgDl: number | null;
  heartRate: number | null;
  respiratoryRate: number | null;
  spo2: number | null;
  temperatureC: number | null;
  weightKg: number | null;
  notes: string;
  recordedAt: string;
};

type FormState = {
  bpSystolic: string;
  bpDiastolic: string;
  fastingGlucoseMgDl: string;
  ppGlucoseMgDl: string;
  heartRate: string;
  respiratoryRate: string;
  spo2: string;
  temperatureC: string;
  weightKg: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  bpSystolic: "",
  bpDiastolic: "",
  fastingGlucoseMgDl: "",
  ppGlucoseMgDl: "",
  heartRate: "",
  respiratoryRate: "",
  spo2: "",
  temperatureC: "",
  weightKg: "",
  notes: "",
};

function formatRecordedAt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function numOrEmpty(s: string): string | number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export default function PatientVitalsPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const loadReadings = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("You are not logged in.");
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    setError("");
    try {
      const res = await fetch("/api/v1/patient/vitals", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as { readings?: VitalReading[]; error?: string; code?: string };
      if (!res.ok) throw new Error(data.error || "Failed to load vitals.");
      setReadings(Array.isArray(data.readings) ? data.readings : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vitals.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadReadings();
  }, [loadReadings]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setLastSavedAt(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const token = getStoredAccessToken();
    if (!token) {
      setError("You are not logged in.");
      return;
    }
    setLoading(true);
    const payload = {
      bpSystolic: numOrEmpty(form.bpSystolic),
      bpDiastolic: numOrEmpty(form.bpDiastolic),
      fastingGlucoseMgDl: numOrEmpty(form.fastingGlucoseMgDl),
      ppGlucoseMgDl: numOrEmpty(form.ppGlucoseMgDl),
      heartRate: numOrEmpty(form.heartRate),
      respiratoryRate: numOrEmpty(form.respiratoryRate),
      spo2: numOrEmpty(form.spo2),
      temperatureC: numOrEmpty(form.temperatureC),
      weightKg: numOrEmpty(form.weightKg),
      notes: form.notes.trim(),
    };
    fetch("/api/v1/patient/vitals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
      .then(async (res) => {
        const data = (await res.json()) as { reading?: VitalReading; error?: string };
        if (!res.ok) throw new Error(data.error || "Failed to save vitals.");
        if (data.reading?.recordedAt) {
          setLastSavedAt(data.reading.recordedAt);
        }
        setForm(EMPTY_FORM);
        await loadReadings();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to save vitals.");
      })
      .finally(() => setLoading(false));
  }

  function bpLabel(r: VitalReading): string {
    if (r.bpSystolic != null && r.bpDiastolic != null) {
      return `${r.bpSystolic}/${r.bpDiastolic}`;
    }
    if (r.bpSystolic != null) return String(r.bpSystolic);
    if (r.bpDiastolic != null) return String(r.bpDiastolic);
    return "—";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Vitals</h1>
        <p className="mt-1 text-sm text-slate-600">
          Record blood pressure, glucose, heart rate, and other readings.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {lastSavedAt ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Saved at {formatRecordedAt(lastSavedAt)}.
          </p>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            New reading
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Blood pressure — systolic (mmHg)"
              value={form.bpSystolic}
              onChange={(v) => update("bpSystolic", v)}
              placeholder="e.g. 120"
            />
            <Field
              label="Blood pressure — diastolic (mmHg)"
              value={form.bpDiastolic}
              onChange={(v) => update("bpDiastolic", v)}
              placeholder="e.g. 80"
            />
            <Field
              label="Fasting blood sugar (mg/dL)"
              value={form.fastingGlucoseMgDl}
              onChange={(v) => update("fastingGlucoseMgDl", v)}
              placeholder="e.g. 95"
            />
            <Field
              label="PP blood sugar (mg/dL)"
              value={form.ppGlucoseMgDl}
              onChange={(v) => update("ppGlucoseMgDl", v)}
              placeholder="Post-prandial"
            />
            <Field
              label="Heart rate (bpm)"
              value={form.heartRate}
              onChange={(v) => update("heartRate", v)}
              placeholder="e.g. 72"
            />
            <Field
              label="Respiratory rate (/min)"
              value={form.respiratoryRate}
              onChange={(v) => update("respiratoryRate", v)}
            />
            <Field
              label="SpO₂ (%)"
              value={form.spo2}
              onChange={(v) => update("spo2", v)}
              placeholder="e.g. 98"
            />
            <Field
              label="Temperature (°C)"
              value={form.temperatureC}
              onChange={(v) => update("temperatureC", v)}
            />
            <Field
              label="Weight (kg)"
              value={form.weightKg}
              onChange={(v) => update("weightKg", v)}
            />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">Other notes</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Symptoms, context, device used, etc."
            />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-teal-700 disabled:opacity-60"
            >
              {loading ? "Saving…" : "Save vitals"}
            </button>
          </div>
        </section>
      </form>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            History
          </h2>
          <button
            type="button"
            onClick={() => void loadReadings()}
            className="text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            Refresh
          </button>
        </div>
        {loadingList ? (
          <p className="mt-4 text-sm text-slate-600">Loading history…</p>
        ) : readings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No vitals recorded yet. Add a reading above.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">Date &amp; time</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">BP (sys/dia)</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">Fasting</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">PP</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">HR</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">RR</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">SpO₂</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">Temp °C</th>
                  <th className="whitespace-nowrap py-2 pr-4 font-medium">Wt kg</th>
                  <th className="min-w-[12rem] py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 align-top text-slate-900">
                    <td className="whitespace-nowrap py-2 pr-4 text-slate-800">
                      {formatRecordedAt(r.recordedAt)}
                    </td>
                    <td className="py-2 pr-4">{bpLabel(r)}</td>
                    <td className="py-2 pr-4">
                      {r.fastingGlucoseMgDl != null ? r.fastingGlucoseMgDl : "—"}
                    </td>
                    <td className="py-2 pr-4">{r.ppGlucoseMgDl != null ? r.ppGlucoseMgDl : "—"}</td>
                    <td className="py-2 pr-4">{r.heartRate != null ? r.heartRate : "—"}</td>
                    <td className="py-2 pr-4">{r.respiratoryRate != null ? r.respiratoryRate : "—"}</td>
                    <td className="py-2 pr-4">{r.spo2 != null ? r.spo2 : "—"}</td>
                    <td className="py-2 pr-4">{r.temperatureC != null ? r.temperatureC : "—"}</td>
                    <td className="py-2 pr-4">{r.weightKg != null ? r.weightKg : "—"}</td>
                    <td className="max-w-xs py-2 text-slate-700">{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{props.label}</label>
      <input
        type="text"
        inputMode="decimal"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  );
}
