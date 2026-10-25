
import { PrismaClient, UserRole } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "MjditalPass2026";
const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const CLINIC_ID = "00000000-0000-4000-8000-000000000002";

const DEMO_USERS = [
  {
    email: "admin@mjdital.com",
    role: UserRole.ADMIN,
    fullNameAr: "مدير النظام",
    fullNameEn: "System Admin",
  },
  {
    email: "doctor@mjdital.com",
    role: UserRole.DOCTOR,
    fullNameAr: "د. نورة أحمد",
    fullNameEn: "Dr. Noura Ahmad",
  },
  {
    email: "reception@mjdital.com",
    role: UserRole.RECEPTIONIST,
    fullNameAr: "سارة العتيبي",
    fullNameEn: "Sarah Alotaibi",
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot seed demo data in production.");
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // 1. Organization
  const organization = await prisma.organization.upsert({
    where: { id: ORGANIZATION_ID },
    update: {
      nameAr: "مركز الرعاية التخصصية",
      nameEn: "Specialty Care Center",
      isActive: true,
    },
    create: {
      id: ORGANIZATION_ID,
      nameAr: "مركز الرعاية التخصصية",
      nameEn: "Specialty Care Center",
      city: "Riyadh",
      region: "SA-01",
      timezone: "Asia/Riyadh",
      isActive: true,
    },
  });

  // 2. Clinic
  const clinic = await prisma.clinic.upsert({
    where: { id: CLINIC_ID },
    update: {
      organizationId: organization.id,
      nameAr: "عيادة الأسنان",
      nameEn: "Dental Clinic",
      specialty: "Dentistry",
      isActive: true,
    },
    create: {
      id: CLINIC_ID,
      organizationId: organization.id,
      nameAr: "عيادة الأسنان",
      nameEn: "Dental Clinic",
      specialty: "Dentistry",
      city: "Riyadh",
      region: "SA-01",
      timezone: "Asia/Riyadh",
      isActive: true,
    },
  });

  // 3. Users
  const users = [];

  for (const account of DEMO_USERS) {
    const existingUser = await prisma.user.findFirst({
      where: {
        organizationId: organization.id,
        email: account.email,
      },
    });

    const userData = {
      organizationId: organization.id,
      email: account.email,
      passwordHash,
      fullNameAr: account.fullNameAr,
      fullNameEn: account.fullNameEn,
      role: account.role,
      isActive: true,
    };

    const user = existingUser
      ? await prisma.user.update({
        where: { id: existingUser.id },
        data: userData,
      })
      : await prisma.user.create({
        data: userData,
      });

    users.push(user);
  }

  // 4. Doctor profile
  const doctorUser = users.find(
    (user) => user.email === "doctor@mjdital.com",
  );

  if (!doctorUser) {
    throw new Error("Demo doctor user was not found.");
  }

  const existingDoctor = await prisma.doctor.findUnique({
    where: { userId: doctorUser.id },
  });

  const doctorData = {
    organizationId: organization.id,
    clinicId: clinic.id,
    userId: doctorUser.id,
    fullNameAr: doctorUser.fullNameAr,
    fullNameEn: doctorUser.fullNameEn,
    specialtyAr: "طب الأسنان",
    specialtyEn: "Dentistry",
    scfhsLicenseNumber: "SCFHS-DEMO-0001",
    isActive: true,
  };

  if (existingDoctor) {
    await prisma.doctor.update({
      where: { id: existingDoctor.id },
      data: doctorData,
    });
  } else {
    await prisma.doctor.create({
      data: doctorData,
    });
  }

  console.info("Demo seed completed successfully.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
