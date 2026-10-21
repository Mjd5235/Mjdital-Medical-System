import "server-only";

import type { Portal } from "@/lib/i18n/get-locale";

const DEMO_EMAIL: Record<Portal, string> = {
  admin: "admin@mjdital.com",
  doctor: "doctor@mjdital.com",
  reception: "reception@mjdital.com",
};

export type DemoLoginHint = {
  email: string;
  password: string;
};

export function getDemoLoginHint(portal: Portal): DemoLoginHint | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  if (process.env.ALLOW_DEMO_HINTS === "false") {
    return null;
  }

  return {
    email: DEMO_EMAIL[portal],
    password: "MjditalPass2026",
  };
}
