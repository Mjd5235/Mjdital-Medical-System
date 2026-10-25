
import { cookies } from "next/headers";
import {
  parseSessionToken,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth/session-token";

export { SESSION_COOKIE, type SessionUser };

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  console.log("[Session Debug]", {
    cookieExists: Boolean(token),
    secretExists: Boolean(process.env.SESSION_SECRET),
    secretLength: process.env.SESSION_SECRET?.length ?? 0,
  });

  const session = await parseSessionToken(token);

  console.log("[Session Debug] Valid:", Boolean(session));

  return session;
}

export function organizationIdFromSession(session: SessionUser): string {
  return session.organizationId;
}
