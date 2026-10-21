import { LoginPage } from "@/components/auth/login-page";

export default function DoctorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginPage portal="doctor" searchParams={searchParams} />;
}
