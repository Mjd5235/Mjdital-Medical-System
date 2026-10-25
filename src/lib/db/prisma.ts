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

const CLINIC_SCOPED_MODELS = new Set([
  "Doctor",
  "Patient",
  "Appointment",
  "AuditLog",
  "Invoice",
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

type QueryArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
};

function hasOrganizationId(
  value: Record<string, unknown> | undefined,
): boolean {
  return (
    value !== undefined &&
    (value.organizationId !== undefined ||
      value.organization_id !== undefined)
  );
}

function hasClinicId(
  value: Record<string, unknown> | undefined,
): boolean {
  return (
    value !== undefined &&
    (value.clinicId !== undefined || value.clinic_id !== undefined)
  );
}

function assertTenantFilter(
  model: string,
  operation: string,
  args: unknown,
): void {
  if (!TENANT_MODELS.has(model)) {
    return;
  }

  const typedArgs = (args ?? {}) as QueryArgs;
  const where = typedArgs.where;
  const data = typedArgs.data;

  if (operation === "create" || operation === "createMany") {
    const rows = operation === "createMany"
      ? (Array.isArray(data) ? data : [])
      : [data as Record<string, unknown> | undefined];

    if (rows.length === 0) {
      throw new Error(`${model}.${operation} requires data`);
    }

    for (const row of rows) {
      if (!hasOrganizationId(row)) {
        throw new Error(
          `${model}.${operation} requires organizationId`,
        );
      }

      if (CLINIC_SCOPED_MODELS.has(model) && !hasClinicId(row)) {
        throw new Error(
          `${model}.${operation} requires clinicId`,
        );
      }
    }

    return;
  }

  if (operation === "upsert") {
    if (!hasOrganizationId(where)) {
      throw new Error(`${model}.upsert must filter by organizationId`);
    }

    if (CLINIC_SCOPED_MODELS.has(model) && !hasClinicId(where)) {
      throw new Error(`${model}.upsert must filter by clinicId`);
    }

    const createData = (
      data as
      | {
        create?: Record<string, unknown>;
      }
      | undefined
    )?.create;

    if (!hasOrganizationId(createData)) {
      throw new Error(`${model}.upsert create data requires organizationId`);
    }

    if (
      CLINIC_SCOPED_MODELS.has(model) &&
      !hasClinicId(createData)
    ) {
      throw new Error(`${model}.upsert create data requires clinicId`);
    }

    return;
  }

  if (READ_OR_MUTATE.has(operation)) {
    const whereFilter = where ?? {};

    // 💡 تعديل حماية: استثناء جدول الـ User من الإغلاق الإجباري عند البحث بالايميل فقط (مثل Auth)
    if (model === "User" && (whereFilter.email !== undefined || whereFilter.id !== undefined)) {
      return;
    }

    if (!hasOrganizationId(whereFilter)) {
      throw Error(
        `${model}.${operation} must filter by organizationId`
      );
    }

    if (
      CLINIC_SCOPED_MODELS.has(model) &&
      !hasClinicId(whereFilter)
    ) {
      throw Error(
        `${model}.${operation} must filter by clinicId`
      );
    }
  }
}

function assertAuditLogAppendOnly(
  model: string,
  operation: string,
): void {
  if (model !== "AuditLog") {
    return;
  }

  if (
    WRITE_OPERATIONS.has(operation) &&
    operation !== "create" &&
    operation !== "createMany"
  ) {
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

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient();

/**
 * Unscoped client for trusted authentication and system operations only.
 * Never expose it to request handlers.
 */
export const prismaBase =
  globalForPrisma.prismaBase ?? createBasePrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaBase = prismaBase;
}
