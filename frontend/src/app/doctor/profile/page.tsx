"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessageFromUnknown, fetchDoctorProfile, saveDoctorProfile } from "@/lib/api-client";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export default function DoctorProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [form, setForm] = useState<{
    specialization: string;
    department: string;
    hospitalAffiliation: string;
    yearsExperience: string;
    consultationFee: string;
    bio: string;
    academicRecords: string;
    professionalExperience: string;
    achievements: string;
    availableForTelemedicine: boolean;
    photoDataUrl: string;
  }>({
    specialization: "",
    department: "",
    hospitalAffiliation: "",
    yearsExperience: "",
    consultationFee: "",
    bio: "",
    academicRecords: "",
    professionalExperience: "",
    achievements: "",
    availableForTelemedicine: true,
    photoDataUrl: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError("");
      try {
        const r = await fetchDoctorProfile();
        if (cancelled) return;
        if (r.profile) {
          const p = r.profile;
          setForm({
            specialization: p.specialization || "",
            department: p.department || "",
            hospitalAffiliation: p.hospitalAffiliation || "",
            yearsExperience:
              p.yearsExperience === "" || p.yearsExperience === undefined
                ? ""
                : String(p.yearsExperience),
            consultationFee:
              p.consultationFee === "" || p.consultationFee === undefined
                ? ""
                : String(p.consultationFee),
            bio: p.bio || "",
            academicRecords: p.academicRecords || "",
            professionalExperience: p.professionalExperience || "",
            achievements: p.achievements || "",
            availableForTelemedicine: p.availableForTelemedicine,
            photoDataUrl: p.photoDataUrl ?? "",
          });
        }
      } catch (e) {
        if (!cancelled) setError(errorMessageFromUnknown(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
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
      setDone("");
      setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }));
    };
    reader.onerror = () => window.alert("Could not read selected image.");
    reader.readAsDataURL(file);
  }

  function clearPhoto() {
    setDone("");
    setForm((prev) => ({ ...prev, photoDataUrl: "" }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");
    setSaving(true);
    try {
      const years = form.yearsExperience.trim() ? Number(form.yearsExperience) : "";
      const fee = form.consultationFee.trim() ? Number(form.consultationFee) : "";
      await saveDoctorProfile({
        specialization: form.specialization.trim() || "General practice",
        department: form.department.trim(),
        hospitalAffiliation: form.hospitalAffiliation.trim(),
        yearsExperience: Number.isFinite(years) ? years : "",
        consultationFee: Number.isFinite(fee) ? fee : "",
        bio: form.bio.trim(),
        academicRecords: form.academicRecords.trim(),
        professionalExperience: form.professionalExperience.trim(),
        achievements: form.achievements.trim(),
        availableForTelemedicine: form.availableForTelemedicine,
        photoDataUrl: form.photoDataUrl.trim(),
      });
      setDone("Profile saved.");
    } catch (err) {
      setError(errorMessageFromUnknown(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Professional profile</h1>
        <p className="mt-2 text-sm text-slate-600">Share your credentials and experience.</p>

        {loading ? (
          <p className="mt-6 text-slate-600">Loading…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-8">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            {done ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {done}
              </p>
            ) : null}

            <section className="space-y-3">
              {!form.photoDataUrl ? (
                <>
                  <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                    Profile photo
                  </h2>
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
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Choose photo
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={onPhotoSelected}
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                Practice & specialization
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Specialization</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.specialization}
                    onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
                    placeholder="e.g. Cardiology, General practice"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Department</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                    placeholder="Department or unit"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Hospital / affiliation</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.hospitalAffiliation}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hospitalAffiliation: e.target.value }))
                    }
                    placeholder="Institution or practice name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Years of experience</label>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.yearsExperience}
                    onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Consultation fee</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.consultationFee}
                    onChange={(e) => setForm((f) => ({ ...f, consultationFee: e.target.value }))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.availableForTelemedicine}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, availableForTelemedicine: e.target.checked }))
                  }
                />
                Available for telemedicine
              </label>
            </section>

            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                Professional summary
              </h2>
              <p className="text-xs text-slate-500">Brief intro patients see first (optional).</p>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.bio}
                onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Short overview of your practice and focus areas."
              />
            </section>

            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                Academic & training
              </h2>
              <p className="text-xs text-slate-500">
                Degrees, board certifications, fellowships, and institutions (optional).
              </p>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.academicRecords}
                onChange={(e) => setForm((f) => ({ ...f, academicRecords: e.target.value }))}
                placeholder="e.g. MBBS, MD; Residency at …; Board certification in …"
              />
            </section>

            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                Professional experience
              </h2>
              <p className="text-xs text-slate-500">
                Roles, hospitals, clinics, and responsibilities—in addition to &ldquo;years of
                experience&rdquo; above (optional).
              </p>
              <textarea
                rows={7}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.professionalExperience}
                onChange={(e) =>
                  setForm((f) => ({ ...f, professionalExperience: e.target.value }))
                }
                placeholder="Prior positions, leadership, key clinical experience."
              />
            </section>

            <section className="space-y-2">
              <h2 className="border-b border-slate-200 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-800">
                Achievements & recognition
              </h2>
              <p className="text-xs text-slate-500">Awards, publications, talks, memberships (optional).</p>
              <textarea
                rows={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form.achievements}
                onChange={(e) => setForm((f) => ({ ...f, achievements: e.target.value }))}
                placeholder="Honors, research, professional societies, notable contributions."
              />
            </section>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-clinical-600 py-2.5 text-sm font-medium text-white hover:bg-clinical-900 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        )}

        <p className="mt-8 border-t border-slate-100 pt-6">
          <Link href="/doctor/patients" className="text-sm font-medium text-clinical-700 hover:underline">
            Back to my patients
          </Link>
        </p>
      </div>
    </main>
  );
}
