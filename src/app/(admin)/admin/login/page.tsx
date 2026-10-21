import { LoginPage } from "@/components/auth/login-page";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return <LoginPage portal="admin" searchParams={searchParams} />;
}
