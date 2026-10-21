import { LoginPage } from "@/components/auth/login-page";

export default function ReceptionLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginPage portal="reception" searchParams={searchParams} />;
}
