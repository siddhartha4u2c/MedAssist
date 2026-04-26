import { TelemedicineVideoSession } from "@/components/telemedicine/telemedicine-video-session";

export default function PatientTelemedicineVideoPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  return (
    <TelemedicineVideoSession appointmentId={params.appointmentId} backHref="/patient/appointments" />
  );
}
