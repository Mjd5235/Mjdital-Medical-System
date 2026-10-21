import type { Locale } from "@/lib/i18n/types";
import type { Portal } from "@/lib/i18n/get-locale";

export type Dictionary = {
  appName: string;
  clinicName: string;
  city: string;
  language: string;
  darkMode: string;
  lightMode: string;
  logout: string;
  settings: string;
  searchPlaceholder: string;
  welcome: string;
  home: {
    title: string;
    subtitle: string;
    privacy: string;
    copyright: string;
  };
  login: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    rememberMe: string;
    forgotPassword: string;
    forgotPasswordHint: string;
    submit: string;
    supportPrompt: string;
    supportLink: string;
    showPassword: string;
    hidePassword: string;
    demoTitle: string;
  };
  portals: {
    admin: { title: string; description: string; cta: string; badge: string };
    reception: { title: string; description: string; cta: string; badge: string };
    doctor: { title: string; description: string; cta: string; badge: string };
  };
  nav: Record<Portal, { href: string; label: string }[]>;
  dashboards: Record<
    Portal,
    {
      title: string;
      subtitle: string;
      kpis: { label: string; value: string; hint: string }[];
    }
  >;
};

const ar: Dictionary = {
  appName: "مجدتال",
  clinicName: "مركز الرعاية التخصصية",
  city: "الرياض — المملكة العربية السعودية",
  language: "اللغة",
  darkMode: "الوضع الداكن",
  lightMode: "الوضع الفاتح",
  logout: "تسجيل الخروج",
  settings: "الإعدادات",
  searchPlaceholder: "البحث عن مريض أو موعد أو تقرير...",
  welcome: "مرحباً",
  home: {
    title: "مرحباً بك في مركز مجدتال الطبي",
    subtitle: "اختر بوابتك للمتابعة إلى النظام",
    privacy: "خصوصيتك ورعايتك أولويتنا",
    copyright: "© Mjdital Medical Center",
  },
  login: {
    title: "تسجيل الدخول للنظام الطبي",
    subtitle: "مرحباً بعودتك، يرجى إدخال بيانات الدخول",
    emailLabel: "البريد الإلكتروني أو اسم المستخدم",
    emailPlaceholder: "name@medical-center.sa",
    passwordLabel: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    rememberMe: "تذكرني",
    forgotPassword: "نسيت كلمة المرور؟",
    forgotPasswordHint: "لاستعادة كلمة المرور تواصل مع إدارة النظام.",
    submit: "تسجيل الدخول",
    supportPrompt: "هل تواجه مشكلة في الدخول؟",
    supportLink: "تواصل مع الدعم",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    demoTitle: "حساب تجريبي للبيئة المحلية",
  },
  portals: {
    admin: {
      title: "بوابة الإدارة العامة",
      description: "إدارة النظام والموارد",
      cta: "الدخول إلى البوابة",
      badge: "بوابة الإدارة العامة",
    },
    reception: {
      title: "بوابة الاستقبال والمواعيد",
      description: "تنظيم الحجوزات واستقبال المراجعين",
      cta: "الدخول إلى البوابة",
      badge: "بوابة الاستقبال والمواعيد",
    },
    doctor: {
      title: "بوابة الكادر الطبي",
      description: "متابعة المرضى والمهام الطبية",
      cta: "الدخول إلى البوابة",
      badge: "بوابة الكادر الطبي",
    },
  },
  nav: {
    admin: [
      { href: "/admin/dashboard", label: "لوحة التحكم" },
      { href: "/admin/dashboard", label: "الأطباء" },
      { href: "/admin/dashboard", label: "الفواتير" },
      { href: "/admin/dashboard", label: "التقارير" },
    ],
    reception: [
      { href: "/reception/dashboard", label: "الرئيسية" },
      { href: "/reception/dashboard", label: "المواعيد" },
      { href: "/reception/dashboard", label: "المرضى" },
      { href: "/reception/dashboard", label: "الأطباء" },
    ],
    doctor: [
      { href: "/doctor/dashboard", label: "Dashboard" },
      { href: "/doctor/dashboard", label: "Schedule" },
      { href: "/doctor/dashboard", label: "EMR" },
      { href: "/doctor/dashboard", label: "Prescriptions" },
    ],
  },
  dashboards: {
    admin: {
      title: "لوحة الإدارة",
      subtitle: "تشغيل المركز الطبي وعزل بيانات كل عيادة (clinic_id).",
      kpis: [
        { label: "الأطباء النشطون", value: "18", hint: "رخصة الهيئة مفعّلة" },
        { label: "فواتير اليوم", value: "47", hint: "جاهزية ZATCA" },
        { label: "سجلات التدقيق", value: "128", hint: "قراءة وكتابة فقط" },
      ],
    },
    reception: {
      title: "لوحة الاستقبال",
      subtitle: "تسجيل سريع للمرضى وجدولة مواعيد العيادة.",
      kpis: [
        { label: "مواعيد اليوم", value: "24", hint: "موعد مجدول" },
        { label: "المرضى الجدد", value: "08", hint: "ملف سحري جديد" },
        { label: "حالات الطوارئ", value: "03", hint: "حالات اليوم" },
      ],
    },
    doctor: {
      title: "لوحة الطبيب",
      subtitle: "إدخال الملف الطبي الإلكتروني مع قفل الملاحظات بعد التوقيع.",
      kpis: [
        { label: "مواعيد اليوم", value: "12", hint: "عيادة القلب" },
        { label: "بانتظار الكشف", value: "04", hint: "في الانتظار" },
        { label: "مكتملة", value: "06", hint: "موقّعة ومغلقة" },
      ],
    },
  },
};

const en: Dictionary = {
  appName: "Mjdital",
  clinicName: "Specialty Care Center",
  city: "Riyadh — Kingdom of Saudi Arabia",
  language: "Language",
  darkMode: "Dark mode",
  lightMode: "Light mode",
  logout: "Sign out",
  settings: "Settings",
  searchPlaceholder: "Search patient, appointment, or report...",
  welcome: "Welcome",
  home: {
    title: "Welcome to Mjdital Medical Center",
    subtitle: "Choose your portal to continue to the system",
    privacy: "Your privacy and care come first",
    copyright: "© Mjdital Medical Center",
  },
  login: {
    title: "Sign in to the medical system",
    subtitle: "Welcome back, please enter your credentials",
    emailLabel: "Email or username",
    emailPlaceholder: "name@medical-center.sa",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    forgotPasswordHint: "To reset your password, contact system administration.",
    submit: "Sign in",
    supportPrompt: "Having trouble signing in?",
    supportLink: "Contact support",
    showPassword: "Show password",
    hidePassword: "Hide password",
    demoTitle: "Local development demo account",
  },
  portals: {
    admin: {
      title: "General Administration Portal",
      description: "Manage the system and resources",
      cta: "Enter portal",
      badge: "General Administration Portal",
    },
    reception: {
      title: "Reception & Appointments Portal",
      description: "Coordinate bookings and welcome visitors",
      cta: "Enter portal",
      badge: "Reception & Appointments Portal",
    },
    doctor: {
      title: "Doctor Portal",
      description: "Follow patients and clinical tasks",
      cta: "Enter portal",
      badge: "Doctor Portal",
    },
  },
  nav: {
    admin: [
      { href: "/admin/dashboard", label: "Dashboard" },
      { href: "/admin/dashboard", label: "Doctors" },
      { href: "/admin/dashboard", label: "Invoices" },
      { href: "/admin/dashboard", label: "Reports" },
    ],
    reception: [
      { href: "/reception/dashboard", label: "Home" },
      { href: "/reception/dashboard", label: "Appointments" },
      { href: "/reception/dashboard", label: "Patients" },
      { href: "/reception/dashboard", label: "Doctors" },
    ],
    doctor: [
      { href: "/doctor/dashboard", label: "Dashboard" },
      { href: "/doctor/dashboard", label: "Schedule" },
      { href: "/doctor/dashboard", label: "EMR" },
      { href: "/doctor/dashboard", label: "Prescriptions" },
    ],
  },
  dashboards: {
    admin: {
      title: "Admin dashboard",
      subtitle: "Operate the medical center with strict tenant isolation.",
      kpis: [
        { label: "Active doctors", value: "18", hint: "SCFHS licenses valid" },
        { label: "Today's invoices", value: "47", hint: "ZATCA ready" },
        { label: "Audit events", value: "128", hint: "Append-only log" },
      ],
    },
    reception: {
      title: "Reception dashboard",
      subtitle: "Register patients quickly and keep the schedule moving.",
      kpis: [
        { label: "Today's appointments", value: "24", hint: "Scheduled" },
        { label: "New patients", value: "08", hint: "New medical files" },
        { label: "Urgent cases", value: "03", hint: "Today" },
      ],
    },
    doctor: {
      title: "Doctor dashboard",
      subtitle: "EMR workflow with immutable notes after Sign & Complete.",
      kpis: [
        { label: "Today's visits", value: "12", hint: "Cardiology clinic" },
        { label: "Waiting", value: "04", hint: "In queue" },
        { label: "Completed", value: "06", hint: "Signed and locked" },
      ],
    },
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return locale === "en" ? en : ar;
}
