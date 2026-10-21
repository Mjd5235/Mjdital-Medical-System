import { cookies } from "next/headers";
import {
  parseSessionToken,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth/session-token";

export { SESSION_COOKIE, type SessionUser };

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return await parseSessionToken(store.get(SESSION_COOKIE)?.value);
}

export function clinicIdFromSession(session: SessionUser): string {
  return session.clinicId;
}
