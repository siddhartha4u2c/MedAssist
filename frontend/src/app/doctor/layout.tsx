import { DoctorShell } from "@/components/layout/doctor-shell";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return <DoctorShell>{children}</DoctorShell>;
}
