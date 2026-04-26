import { TelemedicineVideoSession } from "@/components/telemedicine/telemedicine-video-session";

export default function DoctorTelemedicineVideoPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  return (
    <TelemedicineVideoSession appointmentId={params.appointmentId} backHref="/doctor/appointments" />
  );
}
