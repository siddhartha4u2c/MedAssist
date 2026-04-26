/**
 * Patient medications are stored in PatientProfile.currentMedications as JSON
 * when using the structured Medications tab; legacy plain text is still supported.
 */

export const MEDICATIONS_PAYLOAD_VERSION = 1 as const;

export type MedicationFormValue = "tablets" | "liquid" | "injection" | "";

export type MedicationRow = {
  id: string;
  date: string;
  doctorName: string;
  medicineName: string;
  form: MedicationFormValue;
  frequency: string;
  notes: string;
};

export const MEDICATION_FORM_OPTIONS: { value: MedicationFormValue; label: string }[] = [
  { value: "", label: "Select form…" },
  { value: "tablets", label: "Tablets" },
  { value: "liquid", label: "Liquid" },
  { value: "injection", label: "Injection" },
];

function newRowId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyMedicationRow(): MedicationRow {
  return {
    id: newRowId(),
    date: "",
    doctorName: "",
    medicineName: "",
    form: "",
    frequency: "",
    notes: "",
  };
}

function isValidForm(v: unknown): v is MedicationFormValue {
  return v === "" || v === "tablets" || v === "liquid" || v === "injection";
}

function normalizeMedicationRow(r: unknown): MedicationRow {
  if (!r || typeof r !== "object") return emptyMedicationRow();
  const o = r as Record<string, unknown>;
  const legacyMedicine = typeof o.medicine === "string" ? o.medicine : "";
  return {
    id: typeof o.id === "string" && o.id ? o.id : newRowId(),
    date: typeof o.date === "string" ? o.date : "",
    doctorName: typeof o.doctorName === "string" ? o.doctorName : "",
    medicineName:
      typeof o.medicineName === "string" && o.medicineName
        ? o.medicineName
        : legacyMedicine,
    form: isValidForm(o.form) ? o.form : "",
    frequency: typeof o.frequency === "string" ? o.frequency : "",
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

export function isStructuredMedicationsStorage(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith("{")) return false;
  try {
    const j = JSON.parse(t) as { v?: unknown; rows?: unknown };
    return j.v === MEDICATIONS_PAYLOAD_VERSION && Array.isArray(j.rows);
  } catch {
    return false;
  }
}

export function parseMedicationsFromStorage(raw: string): {
  rows: MedicationRow[];
  legacyText: string | null;
} {
  const t = raw.trim();
  if (!t) return { rows: [], legacyText: null };
  try {
    const j = JSON.parse(t) as { v?: unknown; rows?: unknown };
    if (j.v === MEDICATIONS_PAYLOAD_VERSION && Array.isArray(j.rows)) {
      return { rows: j.rows.map(normalizeMedicationRow), legacyText: null };
    }
  } catch {
    /* treat as legacy */
  }
  return { rows: [], legacyText: t };
}

export function serializeMedicationsToStorage(rows: MedicationRow[]): string {
  return JSON.stringify({ v: MEDICATIONS_PAYLOAD_VERSION, rows });
}

export function formLabelForMedication(v: MedicationFormValue): string {
  if (!v) return "—";
  const hit = MEDICATION_FORM_OPTIONS.find((o) => o.value === v);
  return hit?.label ?? "—";
}
