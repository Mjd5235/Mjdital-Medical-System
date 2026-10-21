export class NationalIdValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NationalIdValidationError";
  }
}

export type IdentityKind = "NATIONAL_ID" | "IQAMA";

export type ParsedNationalId = {
  nationalId: string;
  identityType: IdentityKind;
};

export function parseSaudiIdentity(raw: string): ParsedNationalId {
  const nationalId = raw.trim();

  if (!/^\d{10}$/.test(nationalId)) {
    throw new NationalIdValidationError(
      "National ID / Iqama must be exactly 10 digits",
    );
  }

  if (nationalId.startsWith("1")) {
    return { nationalId, identityType: "NATIONAL_ID" };
  }

  if (nationalId.startsWith("2")) {
    return { nationalId, identityType: "IQAMA" };
  }

  throw new NationalIdValidationError(
    "Saudi National ID must start with 1 and Iqama must start with 2",
  );
}
