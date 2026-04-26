"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearPortalSession, getStoredAccessToken } from "@/lib/auth-storage";

type ProfileFormState = {
  fullName: string;
  age: string;
  gender: string;
  phone: string;
  emergencyContact: string;
  photoDataUrl: string;
  heightCm: string;
  weightKg: string;
  bloodPressure: string;
  heartRate: string;
  bloodGroup: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
  pastSurgeries: string;
  medicalHistory: string;
  smokingStatus: string;
  alcoholUse: string;
  occupation: string;
  insuranceProvider: string;
  insurancePolicyNo: string;
  primaryDoctor: string;
};

const INITIAL_STATE: ProfileFormState = {
  fullName: "",
  age: "",
  gender: "",
  phone: "",
  emergencyContact: "",
  photoDataUrl: "",
  heightCm: "",
  weightKg: "",
  bloodPressure: "",
  heartRate: "",
  bloodGroup: "",
  allergies: "",
  chronicConditions: "",
  currentMedications: "",
  pastSurgeries: "",
  medicalHistory: "",
  smokingStatus: "",
  alcoholUse: "",
  occupation: "",
  insuranceProvider: "",
  insurancePolicyNo: "",
  primaryDoctor: "",
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function PatientProfilePage() {
  const router = useRouter();
  const [form, setForm] = useState<ProfileFormState>(INITIAL_STATE);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const token = getStoredAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Please sign in to view your profile.");
          setInitializing(false);
          router.replace("/login");
        }
        return;
      }
      try {
        const res = await fetch("/api/v1/patient/profile", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json()) as { profile?: Partial<ProfileFormState> | null; error?: string };
        if (res.status === 401) {
          clearPortalSession();
          throw new Error("Your session expired. Please sign in again.");
        }
        if (!res.ok) throw new Error(data.error || "Failed to load profile.");
        if (!cancelled && data.profile) {
          setForm((prev) => ({ ...prev, ...data.profile }));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load profile.");
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  function onPhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      window.alert("Please choose an image file (JPEG, PNG, WebP, etc.).");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      window.alert("Image is too large. Maximum size is 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setSaved(false);
      setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }));
    };
    reader.onerror = () => window.alert("Could not read selected image.");
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setForm((prev) => ({ ...prev, photoDataUrl: "" }));
    setSaved(false);
  }

  function update<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setSaved(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const token = getStoredAccessToken();
    if (!token) {
      setError("Please sign in to continue.");
      router.replace("/login");
      return;
    }
    setLoading(true);
    fetch("/api/v1/patient/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(form),
    })
      .then(async (res) => {
        const data = (await res.json()) as { error?: string };
        if (res.status === 401) {
          clearPortalSession();
          throw new Error("Your session expired. Please sign in again.");
        }
        if (!res.ok) throw new Error(data.error || "Failed to save profile.");
        setSaved(true);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to save profile.");
        if (err instanceof Error && /session expired|sign in again/i.test(err.message)) {
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Patient profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Complete and maintain your personal, vitals, and medical information.
        </p>
      </div>

      <form onSubmit={onSave} className="space-y-4">
        {initializing ? (
          <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
            Loading profile...
          </p>
        ) : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Basic details
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Full name"
              value={form.fullName}
              onChange={(v) => update("fullName", v)}
              placeholder="Enter full name"
            />
            <Field
              label="Age"
              value={form.age}
              onChange={(v) => update("age", v)}
              placeholder="Enter age"
              type="number"
            />
            <SelectField
              label="Gender"
              value={form.gender}
              onChange={(v) => update("gender", v)}
              options={["Male", "Female", "Non-binary", "Prefer not to say"]}
            />
            <Field
              label="Blood group"
              value={form.bloodGroup}
              onChange={(v) => update("bloodGroup", v)}
              placeholder="e.g. O+"
            />
            <Field
              label="Phone"
              value={form.phone}
              onChange={(v) => update("phone", v)}
              placeholder="Enter phone number"
            />
            <Field
              label="Emergency contact"
              value={form.emergencyContact}
              onChange={(v) => update("emergencyContact", v)}
              placeholder="Name and number"
            />
            <div className="md:col-span-2">
              {!form.photoDataUrl ? (
                <>
                  <span className="text-sm font-medium text-slate-700">Profile photo</span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Upload a clear photo (max 5 MB).
                  </p>
                </>
              ) : null}
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
                {form.photoDataUrl ? (
                  <div className="flex flex-col items-start gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.photoDataUrl}
                      alt="Profile preview"
                      className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={clearPhoto}
                      className="text-xs font-medium text-red-700 hover:underline"
                    >
                      Remove photo
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      Choose photo
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={onPhotoSelected}
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Vitals
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Height (cm)"
              value={form.heightCm}
              onChange={(v) => update("heightCm", v)}
              type="number"
              placeholder="e.g. 170"
            />
            <Field
              label="Weight (kg)"
              value={form.weightKg}
              onChange={(v) => update("weightKg", v)}
              type="number"
              placeholder="e.g. 68"
            />
            <Field
              label="Blood pressure"
              value={form.bloodPressure}
              onChange={(v) => update("bloodPressure", v)}
              placeholder="e.g. 120/80"
            />
            <Field
              label="Heart rate (bpm)"
              value={form.heartRate}
              onChange={(v) => update("heartRate", v)}
              type="number"
              placeholder="e.g. 74"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Medical history
          </h2>
          <div className="mt-4 grid gap-4">
            <TextAreaField
              label="Known allergies"
              value={form.allergies}
              onChange={(v) => update("allergies", v)}
              placeholder="List allergies, if any"
            />
            <TextAreaField
              label="Chronic conditions"
              value={form.chronicConditions}
              onChange={(v) => update("chronicConditions", v)}
              placeholder="e.g. Diabetes, hypertension"
            />
            <TextAreaField
              label="Past surgeries / major procedures"
              value={form.pastSurgeries}
              onChange={(v) => update("pastSurgeries", v)}
              placeholder="Provide details with dates if available"
            />
            <TextAreaField
              label="Additional medical history"
              value={form.medicalHistory}
              onChange={(v) => update("medicalHistory", v)}
              placeholder="Any other relevant history"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Other professional details
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field
              label="Occupation"
              value={form.occupation}
              onChange={(v) => update("occupation", v)}
              placeholder="Enter occupation"
            />
            <Field
              label="Primary doctor"
              value={form.primaryDoctor}
              onChange={(v) => update("primaryDoctor", v)}
              placeholder="Doctor name"
            />
            <Field
              label="Insurance provider"
              value={form.insuranceProvider}
              onChange={(v) => update("insuranceProvider", v)}
              placeholder="Insurance company"
            />
            <Field
              label="Insurance policy no."
              value={form.insurancePolicyNo}
              onChange={(v) => update("insurancePolicyNo", v)}
              placeholder="Policy number"
            />
            <SelectField
              label="Smoking status"
              value={form.smokingStatus}
              onChange={(v) => update("smokingStatus", v)}
              options={["Never", "Former", "Current"]}
            />
            <SelectField
              label="Alcohol use"
              value={form.alcoholUse}
              onChange={(v) => update("alcoholUse", v)}
              options={["Never", "Occasional", "Regular"]}
            />
          </div>
        </section>

        <div className="flex items-center justify-end rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <button
            type="submit"
            disabled={loading || initializing}
            className="rounded-lg bg-clinical-600 px-4 py-2 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save profile"}
          </button>
        </div>

        {saved ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Profile saved successfully.
          </p>
        ) : null}
      </form>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
}) {
  const { label, value, onChange, placeholder, type = "text" } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600"
      />
    </label>
  );
}

function TextAreaField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const { label, value, onChange, placeholder } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600"
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const { label, value, onChange, options } = props;
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-clinical-600 focus:ring-1 focus:ring-clinical-600"
      >
        <option value="">Select</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
