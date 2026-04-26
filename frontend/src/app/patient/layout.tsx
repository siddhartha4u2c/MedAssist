import { PatientShell } from "@/components/layout/patient-shell";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return <PatientShell>{children}</PatientShell>;
}
