import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "MjditalPass2026";
const CLINIC_ID = "00000000-0000-4000-8000-000000000001";

const DEMO_USERS: {
  email: string;
  role: UserRole;
  fullNameAr: string;
  fullNameEn: string;
}[] = [
  {
    email: "admin@mjdital.com",
    role: "ADMIN",
    fullNameAr: "مدير النظام",
    fullNameEn: "System Admin",
  },
  {
    email: "doctor@mjdital.com",
    role: "DOCTOR",
    fullNameAr: "د. نورة أحمد",
    fullNameEn: "Dr. Noura Ahmad",
  },
  {
    email: "reception@mjdital.com",
    role: "RECEPTIONIST",
    fullNameAr: "سارة العتيبي",
    fullNameEn: "Sarah Alotaibi",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo accounts in production");
  }

  const passwordHash = hashPassword(DEMO_PASSWORD);

  await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {
      nameAr: "مركز الرعاية التخصصية",
      nameEn: "Specialty Care Center",
      isActive: true,
    },
    create: {
      id: CLINIC_ID,
      nameAr: "مركز الرعاية التخصصية",
      nameEn: "Specialty Care Center",
      city: "Riyadh",
      region: "SA-01",
      timezone: "Asia/Riyadh",
    },
  });

  for (const account of DEMO_USERS) {
    const existing = await prisma.user.findFirst({
      where: { clinicId: CLINIC_ID, email: account.email },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: account.role,
          fullNameAr: account.fullNameAr,
          fullNameEn: account.fullNameEn,
          isActive: true,
          ...(process.env.RESET_DEMO_PASSWORDS === "true"
            ? { passwordHash }
            : {}),
        },
      });
      continue;
    }

    await prisma.user.create({
      data: {
        clinicId: CLINIC_ID,
        email: account.email,
        passwordHash,
        fullNameAr: account.fullNameAr,
        fullNameEn: account.fullNameEn,
        role: account.role,
        isActive: true,
      },
    });
  }

  const doctorUser = await prisma.user.findFirst({
    where: { clinicId: CLINIC_ID, email: "doctor@mjdital.com" },
  });

  if (doctorUser) {
    const doctorProfile = await prisma.doctor.findFirst({
      where: { clinicId: CLINIC_ID, userId: doctorUser.id },
    });

    if (!doctorProfile) {
      await prisma.doctor.create({
        data: {
          clinicId: CLINIC_ID,
          userId: doctorUser.id,
          fullNameAr: doctorUser.fullNameAr,
          fullNameEn: doctorUser.fullNameEn,
          specialtyAr: "الباطنة",
          specialtyEn: "Internal Medicine",
          scfhsLicenseNumber: "SCFHS-DEMO-0001",
        },
      });
    }
  }

  console.info("Demo accounts are ready for local development.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed");
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
