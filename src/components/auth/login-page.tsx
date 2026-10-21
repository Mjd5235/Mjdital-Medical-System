import { Suspense } from "react";
import { LoginScreen } from "@/components/auth/login-screen";
import { getDemoLoginHint } from "@/lib/auth/demo-hints";
import { portalHomePath, safeNextPath } from "@/lib/auth/safe-path";
import { getLocale, type Portal } from "@/lib/i18n/get-locale";

type LoginPageProps = {
  portal: Portal;
  searchParams?: Promise<{ next?: string }>;
};

async function LoginPageBody({ portal, searchParams }: LoginPageProps) {
  const locale = await getLocale(portal);
  const params = searchParams ? await searchParams : {};
  const nextPath = safeNextPath(portal, params.next ?? null);
  const demoHint = getDemoLoginHint(portal);

  return (
    <LoginScreen
      portal={portal}
      locale={locale}
      nextPath={nextPath === portalHomePath(portal) ? portalHomePath(portal) : nextPath}
      demoHint={demoHint}
    />
  );
}

export function LoginPage({ portal, searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white dark:bg-background" />}>
      <LoginPageBody portal={portal} searchParams={searchParams} />
    </Suspense>
  );
}
