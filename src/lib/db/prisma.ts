import { PrismaClient } from "@prisma/client";

const TENANT_MODELS = new Set([
  "User",
  "Doctor",
  "Patient",
  "Appointment",
  "AuditLog",
  "Invoice",
  "InsuranceProvider",
]);

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
]);

const READ_OR_MUTATE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

function hasClinicId(
  value: Record<string, unknown> | undefined,
): boolean {
  if (!value) {
    return false;
  }

  return value.clinicId !== undefined || value.clinic_id !== undefined;
}

function assertTenantFilter(model: string, operation: string, args: unknown) {
  if (!TENANT_MODELS.has(model)) {
    return;
  }

  const typedArgs = (args ?? {}) as {
    where?: Record<string, unknown>;
    data?: Record<string, unknown> | Record<string, unknown>[];
  };

  if (operation === "create") {
    if (!hasClinicId(typedArgs.data as Record<string, unknown> | undefined)) {
      throw new Error(`${model}.create requires clinicId from the verified session`);
    }
    return;
  }

  if (operation === "createMany") {
    const rows = typedArgs.data;
    if (!Array.isArray(rows) || rows.some((row) => !hasClinicId(row))) {
      throw new Error(`${model}.createMany requires clinicId on every row`);
    }
    return;
  }

  if (READ_OR_MUTATE.has(operation) && !hasClinicId(typedArgs.where)) {
    throw new Error(
      `${model}.${operation} must filter by clinicId derived from the session`,
    );
  }

  if (operation === "upsert") {
    if (!hasClinicId(typedArgs.where)) {
      throw new Error(`${model}.upsert must filter by clinicId`);
    }
  }
}

function assertAuditLogAppendOnly(model: string, operation: string) {
  if (model !== "AuditLog") {
    return;
  }

  if (WRITE_OPERATIONS.has(operation) && operation !== "create" && operation !== "createMany") {
    throw new Error("Audit logs are append-only");
  }

  if (operation === "delete" || operation === "deleteMany") {
    throw new Error("Audit logs cannot be deleted");
  }
}

function createBasePrismaClient() {
  return new PrismaClient();
}

function createPrismaClient() {
  const base = createBasePrismaClient();

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model) {
            assertAuditLogAppendOnly(model, operation);
            assertTenantFilter(model, operation, args);
          }

          return query(args);
        },
      },
    },
  });
}

type PrismaClientExtended = ReturnType<typeof createPrismaClient>;
type PrismaClientBase = ReturnType<typeof createBasePrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientExtended | undefined;
  prismaBase: PrismaClientBase | undefined;
};

/** Tenant-enforced client for clinic-scoped queries. */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

/**
 * Unscoped client for authentication lookups only.
 * Never expose this to request handlers that accept clinicId from the client.
 */
export const prismaBase =
  globalForPrisma.prismaBase ?? createBasePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBase = prismaBase;
}
