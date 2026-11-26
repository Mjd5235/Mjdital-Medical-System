// ============================================================================
// app/(reception)/reception/dashboard/FrontDeskShared.tsx
// Messages (AR/EN), shared class names, motion presets, formatters and the QR encoder used by the
// printable ZATCA Simplified Tax Invoice.
// ============================================================================
import type { Locale } from "@/lib/i18n/types";

const en = {
    pageTitle: "Front Desk / Today",
    breadcrumbRoot: "Reception",
    subtitle: "Live view of today's visits, coverage and billing",
    quickAppointment: "Quick Appointment",
    liveRealtime: "Live",
    livePolling: "Auto-refresh",
    liveConnecting: "Connecting",
    refresh: "Refresh",

    kpiAppointments: "Today's Appointments",
    kpiCompleted: "completed",
    kpiUpcoming: "upcoming",
    kpiWaiting: "In Waiting Room",
    kpiPatients: "Patients",
    kpiNphies: "NPHIES Status",
    kpiEligible: "Eligible",
    kpiAuthPending: "Auth Pending",
    kpiBilling: "Pending ZATCA Billing",
    kpiUnpaid: "Unpaid Visits",

    queueTitle: "Today's Live Patient Queue",
    tabAll: "All",
    tabScheduled: "Scheduled",
    tabWaiting: "Waiting",
    tabInClinic: "In Clinic",
    tabCompleted: "Completed",
    colTime: "Time & Token",
    colPatient: "Patient & National ID",
    colDoctor: "Doctor & Clinic",
    colCoverage: "Coverage / NPHIES",
    colStatus: "Visit Status",
    colActions: "Quick Actions",
    search: "Search patient, ID, token, doctor…",
    allClinics: "All clinics",
    resetFilters: "Reset filters",

    statusLabels: {
        SCHEDULED: "Scheduled",
        CONFIRMED: "Confirmed",
        WAITING: "Waiting",
        IN_PROGRESS: "In Clinic",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled",
        NO_SHOW: "No-show",
    },
    payPending: "Payment pending",
    paidBadge: "Paid · invoiced",
    coverageLabels: {
        CASH: "Cash",
        ELIGIBLE: "Eligible",
        PRE_AUTH_PENDING: "Pre-Auth Pending",
        PARTIAL: "Partially Covered",
        INELIGIBLE: "Not Eligible",
        NOT_VERIFIED: "Not Verified",
    },
    nphiesStatus: {
        COMPLETE: "Complete",
        QUEUED: "Under review",
        PARTIAL: "Partial",
        ERROR: "Rejected",
    },
    codes: {
        ELIGIBLE: "Coverage is active and eligible.",
        NO_COVERAGE: "This patient has no insurance coverage on file.",
        PROVIDER_INACTIVE: "The insurance company is inactive.",
        MISSING_MEMBER_ID: "The insurance member ID is missing.",
        POLICY_INACTIVE: "The insurance policy is inactive.",
        POLICY_EXPIRED: "The insurance policy has expired.",
        POLICY_PENDING: "No policy is linked yet. Awaiting insurer review.",
        PARTIAL_COVERAGE: "Coverage is only partially confirmed.",
        NPHIES_ERROR: "NPHIES could not complete the eligibility check. Please try again.",
        PAYMENT_REQUIRED:
            "Payment and a ZATCA invoice are required before the patient can enter the waiting room.",
        PRICE_CHANGED: "The amount due changed. Review the updated total and confirm again.",
        NOT_TODAY: "Only today's visits can be checked in.",
        INVALID_PAYMENT_METHOD: "Select Cash or Mada / POS.",
        ZATCA_PROFILE_MISSING:
            "The center's ZATCA tax profile (VAT number and national address) is incomplete. Complete Center Settings first.",
        ZATCA_CERT_MISSING: "Please complete ZATCA (CSID) integration in Admin settings first.",
        ZATCA_REJECTED:
            "ZATCA rejected the invoice, so no payment was recorded and the visit stays Scheduled. Check the ZATCA Transmission Log in Admin settings.",
        ZATCA_UNREACHABLE:
            "Could not reach ZATCA. The visit stays Scheduled — please try again in a moment.",
        SETTLEMENT_IN_PROGRESS:
            "This visit is already being settled. Wait a moment and refresh the queue.",
        RECEIPT_UNAVAILABLE: "No ZATCA invoice snapshot is available for this visit.",
        FEE_NOT_CONFIGURED: "This doctor has no consultation fee configured.",
        ALREADY_INVOICED: "This visit already has an invoice. Refresh the queue.",
    },

    checkIn: "Check-In",
    verifyNphies: "Verify NPHIES",
    createInvoice: "Create Invoice",
    viewInvoice: "View Invoice",
    checkedIn: "Checked in",
    rowActions: "More actions",
    menuConfirm: "Confirm appointment",
    menuCheckIn: "Check-In",
    menuSendToClinic: "Send to clinic",
    menuCancel: "Cancel appointment",
    menuNoShow: "Mark as no-show",
    confirmCancel: "Cancel this appointment?",
    confirmNoShow: "Mark this patient as a no-show?",
    cfCancelBody: "This visit will be removed from today's queue and its slot will be released.",
    cfNoShowBody: "The patient will be recorded as absent and removed from today's active queue.",
    cfPatient: "Patient",
    cfDoctor: "Doctor",
    cfTime: "Time",
    cfStatus: "Current status",
    cfBack: "Go back",
    cfConfirmCancel: "Yes, cancel appointment",
    cfConfirmNoShow: "Yes, mark as no-show",
    cfWorking: "Processing…",

    empty: "No visits match your view.",
    emptyToday: "No appointments for today yet.",
    loadFailed: "Unable to load the front desk.",
    retry: "Retry",
    previous: "Previous page",
    next: "Next page",
    showing: "Showing",
    of: "of",
    visits: "visits",

    registerPatient: "+ Register New Patient",
    instantCheck: "Instant NPHIES Eligibility Check",
    walkIn: "Walk-in Visit",
    feedTitle: "Live NPHIES Feed",
    feedEmpty: "No NPHIES activity yet.",
    feedCopay: "Co-pay {value}%",
    feedPolicyInactive: "Policy inactive for {name}",
    nphiesSimulator: "Simulator",
    nphiesProduction: "Production",
    feed: {
        ELIGIBILITY: {
            COMPLETE: "Eligibility check completed for {name}",
            QUEUED: "Eligibility pending for {name}",
            PARTIAL: "Eligibility partially confirmed for {name}",
            ERROR: "Eligibility check failed for {name}",
        },
        PRE_AUTHORIZATION: {
            COMPLETE: "Approval #{ref} Approved",
            QUEUED: "Auth pending • {name}",
            PARTIAL: "Approval #{ref} partially approved",
            ERROR: "Approval #{ref} rejected",
        },
        CLAIM: {
            COMPLETE: "Claim #{ref} accepted",
            QUEUED: "Claim #{ref} under review",
            PARTIAL: "Claim #{ref} partially accepted",
            ERROR: "Claim #{ref} rejected",
        },
        E_PRESCRIPTION: {
            COMPLETE: "E-prescription #{ref} approved",
            QUEUED: "E-prescription #{ref} pending",
            PARTIAL: "E-prescription #{ref} partially approved",
            ERROR: "E-prescription #{ref} rejected",
        },
        POLL: {
            COMPLETE: "Status check #{ref} completed",
            QUEUED: "Status check #{ref} still pending",
            PARTIAL: "Status check #{ref} partially resolved",
            ERROR: "Status check #{ref} failed",
        },
    },
    unknownPatient: "a patient",

    toastBooked: "Appointment booked successfully.",
    toastWalkInCreated:
        "Walk-in visit created. Complete payment to send the patient to the waiting room.",
    toastCheckedIn: "Patient checked in.",
    toastConfirmed: "Appointment confirmed.",
    toastSentToClinic: "Patient sent to the clinic.",
    toastCancelled: "Appointment cancelled.",
    toastNoShow: "Marked as no-show.",
    toastEligible: "Coverage verified:",
    toastEligibilityPending: "Eligibility is under insurer review.",
    toastEligibilityPartial: "Coverage is only partially confirmed.",
    failed: "The operation could not be completed. Please try again.",
    close: "Close",
    cancel: "Cancel",
    loading: "Loading…",
    none: "—",

    patientSearch: "Search by name, ID, file no. or phone",
    patientLabel: "Patient",
    change: "Change",
    noPatients: "No patients found.",
    registerInstead: "Register a new patient",
    searching: "Searching…",
    errPatient: "Select a patient.",
    errDoctor: "Select a doctor.",
    errSlot: "Select a time slot.",

    qaTitle: "Quick Appointment",
    qaClinic: "Clinic",
    qaChooseClinic: "Select clinic",
    qaDoctor: "Doctor",
    qaChooseDoctor: "Select doctor",
    qaDate: "Date",
    qaSlots: "Available slots",
    qaPickDoctor: "Select a clinic and doctor first.",
    qaNoSlots: "No available slots on this date.",
    qaNoDoctors: "No doctors with active shifts in this clinic.",
    qaReason: "Reason for visit (optional)",
    qaBook: "Book Appointment",
    qaBooking: "Booking…",
    qaNoPaymentHint: "No payment is taken at booking. Fees are settled when the patient arrives.",

    wiTitle: "Walk-in Visit",
    wiHint:
        "The visit is created first, then the Check-In & Payment Settlement opens. The patient enters the waiting room only after payment is confirmed and the ZATCA invoice is issued.",
    wiDoctor: "Doctor",
    wiChooseDoctor: "Select doctor",
    wiOffDuty: "off duty",
    wiAdd: "Create Visit & Continue to Payment",
    wiAdding: "Creating…",

    elTitle: "Instant NPHIES Eligibility Check",
    elHint: "Enter the National ID / Iqama of a registered patient.",
    elNationalId: "National ID / Iqama",
    elNationalIdPlaceholder: "10-digit ID number",
    elInvalidId: "Enter a valid 10-digit ID starting with 1 or 2.",
    elRun: "Check Eligibility",
    elRunning: "Checking…",
    elPatient: "Patient",
    elStatus: "Result",
    elPayer: "Insurer",
    elPolicy: "Policy",
    elCopay: "Co-pay",
    elReference: "Reference",
    elLatency: "Response time",
    elMode: "NPHIES mode",
    elCashFallback: "Policy inactive — collect payment in cash from the patient.",
    elCopayPercent: "{value}%",
    elCopayFixed: "{value} SAR fixed",
    elCopayCap: "cap {value} SAR",

    ckTitle: "Check-In & Payment Settlement",
    ckHint:
        "The patient moves to the waiting room only after payment is confirmed and the ZATCA invoice is issued.",
    ckLoading: "Fetching the consultation fee, verifying coverage and calculating VAT…",
    ckStepFee: "Consultation fee",
    ckStepCoverage: "Insurance & NPHIES coverage",
    ckStepVat: "ZATCA VAT",
    ckStepPay: "Payment & ZATCA invoice",
    ckConsultationFee: "Consultation fee",
    ckInsuranceShare: "Insurance share",
    ckPatientShare: "Patient share",
    ckVatLine: "VAT ({rate}%)",
    ckVatExempt: "Saudi citizen — 0% VAT (exempt)",
    ckVatApplied: "Non-Saudi — 15% VAT on the patient share only",
    ckTotal: "Total due",
    ckAmountDue: "Amount Due From Patient Now",
    ckCurrency: "SAR",
    ckPayMethod: "Payment method",
    ckCash: "Cash",
    ckMada: "Mada / POS",
    ckConfirm: "Confirm Payment & Issue ZATCA",
    ckConfirming: "Issuing invoice…",
    ckConverted: "Insurance Not Covered / Expired — Converted to Full Cash Payment",
    ckCashPatient: "Cash patient — the full fee is payable now.",
    ckInsuredEligible: "Insurance eligible and covered by the center",
    ckPayer: "Insurer",
    ckIdentity: "Identity",
    ckIdNational: "Saudi citizen (National ID)",
    ckIdIqama: "Resident / visitor (Iqama)",
    ckStaysScheduled: "Closing this window without paying keeps the visit Scheduled.",
    ckToastPaid: "Payment received — {name} is now in the waiting room.",
    ckPrint: "Print receipt",
    ckNoPaymentDue: "No patient payment is due (fully covered). The invoice is still issued.",
    ckNphiesRef: "NPHIES ref.",
    ckZatcaEnv: "ZATCA environment: {env}",

    invLoading: "Loading the tax invoice…",
    invTitle: "Simplified Tax Invoice",
    invNo: "Invoice no.",
    invDateTime: "Date & time",
    invZatca: "ZATCA status",
    invReported: "ZATCA Reported",
    invPending: "ZATCA Pending",
    invSimulation: "Simulation",
    invPatientVisit: "Patient & visit",
    invMrn: "MRN",
    invIdLabel: "National ID / Iqama",
    invNationality: "Nationality",
    invSaudi: "Saudi — 0% VAT (exempt)",
    invNonSaudi: "Non-Saudi (resident / visitor) — 15% VAT on patient share",
    invDoctor: "Doctor & clinic",
    invInsurance: "Insurance",
    invPayer: "Payer",
    invPolicy: "Policy no.",
    invCopay: "Co-pay",
    invCash: "Cash patient (uninsured)",
    invConverted: "Insurance not covered / expired — billed as full cash",
    invMethod: "Payment method",
    invCode: "Code",
    invDescription: "Description",
    invUnitPrice: "Unit price",
    invInsShare: "Insurance share",
    invPatShare: "Patient share",
    invVat: "VAT",
    invLineTotal: "Total",
    invGross: "Gross total",
    invInsCovered: "Insurance covered",
    invTaxable: "Taxable amount (patient share)",
    invVatRow: "VAT ({rate}%)",
    invVatExemptRow: "VAT (0% — Saudi exempt)",
    invNet: "Net payable by patient",
    invScanQr: "Scan with the ZATCA Fatoora app",
    invQrLabel: "ZATCA Phase 2 QR code",
    invClaim: "Pending NPHIES claim",
    invPhone: "Customer service",
    invThanks: "Thank you for your visit — we wish you good health and wellness",
    invVatNo: "VAT no.",
    invCrNo: "CR no.",
};

const ar: typeof en = {
    pageTitle: "مكتب الاستقبال / اليوم",
    breadcrumbRoot: "الاستقبال",
    subtitle: "نظرة مباشرة على زيارات اليوم والتغطية التأمينية والفوترة",
    quickAppointment: "حجز موعد سريع",
    liveRealtime: "مباشر",
    livePolling: "تحديث تلقائي",
    liveConnecting: "جارٍ الاتصال",
    refresh: "تحديث",

    kpiAppointments: "مواعيد اليوم",
    kpiCompleted: "مكتملة",
    kpiUpcoming: "قادمة",
    kpiWaiting: "في غرفة الانتظار",
    kpiPatients: "مرضى",
    kpiNphies: "حالة نفيس",
    kpiEligible: "مؤهّل",
    kpiAuthPending: "بانتظار الموافقة",
    kpiBilling: "فوترة زاتكا المعلّقة",
    kpiUnpaid: "زيارات غير مدفوعة",

    queueTitle: "قائمة المرضى المباشرة لليوم",
    tabAll: "الكل",
    tabScheduled: "مجدول",
    tabWaiting: "في الانتظار",
    tabInClinic: "في العيادة",
    tabCompleted: "مكتمل",
    colTime: "الوقت والرمز",
    colPatient: "المريض والهوية",
    colDoctor: "الطبيب والعيادة",
    colCoverage: "التغطية / نفيس",
    colStatus: "حالة الزيارة",
    colActions: "إجراءات سريعة",
    search: "ابحث بالمريض أو الهوية أو الرمز أو الطبيب…",
    allClinics: "جميع العيادات",
    resetFilters: "إعادة ضبط التصفية",

    statusLabels: {
        SCHEDULED: "مجدول",
        CONFIRMED: "مؤكد",
        WAITING: "في الانتظار",
        IN_PROGRESS: "في العيادة",
        COMPLETED: "مكتمل",
        CANCELLED: "ملغي",
        NO_SHOW: "غير حاضر",
    },
    payPending: "بانتظار الدفع",
    paidBadge: "مدفوع · مفوتر",
    coverageLabels: {
        CASH: "نقدي",
        ELIGIBLE: "مؤهّل",
        PRE_AUTH_PENDING: "بانتظار الموافقة المسبقة",
        PARTIAL: "تغطية جزئية",
        INELIGIBLE: "غير مؤهّل",
        NOT_VERIFIED: "لم يتم التحقق",
    },
    nphiesStatus: {
        COMPLETE: "مكتمل",
        QUEUED: "قيد المراجعة",
        PARTIAL: "جزئي",
        ERROR: "مرفوض",
    },
    codes: {
        ELIGIBLE: "التغطية سارية والمريض مؤهّل.",
        NO_COVERAGE: "لا توجد تغطية تأمينية مسجلة لهذا المريض.",
        PROVIDER_INACTIVE: "شركة التأمين غير نشطة.",
        MISSING_MEMBER_ID: "رقم عضوية التأمين غير متوفر.",
        POLICY_INACTIVE: "وثيقة التأمين غير نشطة.",
        POLICY_EXPIRED: "انتهت صلاحية وثيقة التأمين.",
        POLICY_PENDING: "لا توجد وثيقة مرتبطة بعد. بانتظار مراجعة شركة التأمين.",
        PARTIAL_COVERAGE: "التغطية مؤكدة جزئيًا فقط.",
        NPHIES_ERROR: "تعذّر إتمام فحص الأهلية عبر منصة نفيس. يرجى المحاولة مرة أخرى.",
        PAYMENT_REQUIRED:
            "يجب تحصيل المبلغ وإصدار فاتورة زاتكا قبل دخول المريض إلى غرفة الانتظار.",
        PRICE_CHANGED: "تغيّر المبلغ المطلوب. راجع الإجمالي المحدّث ثم أكّد من جديد.",
        NOT_TODAY: "يمكن تسجيل وصول زيارات اليوم فقط.",
        INVALID_PAYMENT_METHOD: "اختر نقدي أو شبكة / مدى.",
        ZATCA_PROFILE_MISSING:
            "الملف الضريبي للمركز (الرقم الضريبي والعنوان الوطني) غير مكتمل. أكمل إعدادات المركز أولاً.",
        ZATCA_CERT_MISSING: "يرجى إكمال ربط الزكاة (CSID) من إعدادات الأدمن أولاً",
        ZATCA_REJECTED:
            "رفضت هيئة الزكاة الفاتورة، لذلك لم يُسجَّل الدفع وتبقى الزيارة بحالة مجدول. راجع سجل إرسال الزكاة في إعدادات الأدمن.",
        ZATCA_UNREACHABLE:
            "تعذّر الوصول إلى هيئة الزكاة. تبقى الزيارة بحالة مجدول — حاول مرة أخرى بعد قليل.",
        SETTLEMENT_IN_PROGRESS:
            "هذه الزيارة قيد التسوية بالفعل. انتظر قليلاً ثم حدّث القائمة.",
        RECEIPT_UNAVAILABLE: "لا توجد نسخة محفوظة من فاتورة الزكاة لهذه الزيارة.",
        FEE_NOT_CONFIGURED: "لم يتم تحديد سعر الكشفية لهذا الطبيب.",
        ALREADY_INVOICED: "هذه الزيارة لها فاتورة بالفعل. حدّث القائمة.",
    },

    checkIn: "تسجيل الوصول",
    verifyNphies: "التحقق من نفيس",
    createInvoice: "إنشاء فاتورة",
    viewInvoice: "عرض الفاتورة",
    checkedIn: "تم تسجيل الوصول",
    rowActions: "المزيد من الإجراءات",
    menuConfirm: "تأكيد الموعد",
    menuCheckIn: "تسجيل الوصول",
    menuSendToClinic: "إدخال إلى العيادة",
    menuCancel: "إلغاء الموعد",
    menuNoShow: "تسجيل غير حاضر",
    confirmCancel: "هل تريد إلغاء هذا الموعد؟",
    confirmNoShow: "تسجيل هذا المريض كغير حاضر؟",
    cfCancelBody: "ستتم إزالة هذه الزيارة من قائمة اليوم وإتاحة موعدها من جديد.",
    cfNoShowBody: "سيتم تسجيل المريض كغير حاضر وإزالته من قائمة اليوم النشطة.",
    cfPatient: "المريض",
    cfDoctor: "الطبيب",
    cfTime: "الوقت",
    cfStatus: "الحالة الحالية",
    cfBack: "رجوع",
    cfConfirmCancel: "نعم، إلغاء الموعد",
    cfConfirmNoShow: "نعم، تسجيل غير حاضر",
    cfWorking: "جارٍ التنفيذ…",

    empty: "لا توجد زيارات مطابقة.",
    emptyToday: "لا توجد مواعيد لهذا اليوم بعد.",
    loadFailed: "تعذر تحميل مكتب الاستقبال.",
    retry: "إعادة المحاولة",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
    showing: "عرض",
    of: "من",
    visits: "زيارة",

    registerPatient: "+ تسجيل مريض جديد",
    instantCheck: "فحص أهلية نفيس الفوري",
    walkIn: "زيارة بدون موعد",
    feedTitle: "بث نفيس المباشر",
    feedEmpty: "لا يوجد نشاط في نفيس بعد.",
    feedCopay: "نسبة التحمّل {value}%",
    feedPolicyInactive: "وثيقة التأمين غير فعالة للمريض {name}",
    nphiesSimulator: "محاكي",
    nphiesProduction: "إنتاج",
    feed: {
        ELIGIBILITY: {
            COMPLETE: "اكتمل فحص الأهلية للمريض {name}",
            QUEUED: "فحص الأهلية قيد المراجعة للمريض {name}",
            PARTIAL: "تأكدت الأهلية جزئيًا للمريض {name}",
            ERROR: "فشل فحص الأهلية للمريض {name}",
        },
        PRE_AUTHORIZATION: {
            COMPLETE: "تمت الموافقة #{ref}",
            QUEUED: "موافقة معلّقة • {name}",
            PARTIAL: "موافقة جزئية #{ref}",
            ERROR: "تم رفض الموافقة #{ref}",
        },
        CLAIM: {
            COMPLETE: "تم قبول المطالبة #{ref}",
            QUEUED: "المطالبة #{ref} قيد المراجعة",
            PARTIAL: "قبول جزئي للمطالبة #{ref}",
            ERROR: "تم رفض المطالبة #{ref}",
        },
        E_PRESCRIPTION: {
            COMPLETE: "تمت الموافقة على الوصفة #{ref}",
            QUEUED: "الوصفة #{ref} قيد الانتظار",
            PARTIAL: "موافقة جزئية على الوصفة #{ref}",
            ERROR: "تم رفض الوصفة #{ref}",
        },
        POLL: {
            COMPLETE: "اكتملت متابعة الحالة #{ref}",
            QUEUED: "متابعة الحالة #{ref} ما زالت معلّقة",
            PARTIAL: "تمت متابعة الحالة #{ref} جزئيًا",
            ERROR: "فشلت متابعة الحالة #{ref}",
        },
    },
    unknownPatient: "مريض",

    toastBooked: "تم حجز الموعد بنجاح.",
    toastWalkInCreated: "تم إنشاء الزيارة. أكمل الدفع لإدخال المريض إلى غرفة الانتظار.",
    toastCheckedIn: "تم تسجيل وصول المريض.",
    toastConfirmed: "تم تأكيد الموعد.",
    toastSentToClinic: "تم إدخال المريض إلى العيادة.",
    toastCancelled: "تم إلغاء الموعد.",
    toastNoShow: "تم تسجيل المريض كغير حاضر.",
    toastEligible: "تم التحقق من التغطية:",
    toastEligibilityPending: "الأهلية قيد مراجعة شركة التأمين.",
    toastEligibilityPartial: "التغطية مؤكدة جزئيًا فقط.",
    failed: "تعذر إكمال العملية. يرجى المحاولة مرة أخرى.",
    close: "إغلاق",
    cancel: "إلغاء",
    loading: "جارٍ التحميل…",
    none: "—",

    patientSearch: "ابحث بالاسم أو الهوية أو رقم الملف أو الجوال",
    patientLabel: "المريض",
    change: "تغيير",
    noPatients: "لم يتم العثور على مرضى.",
    registerInstead: "تسجيل مريض جديد",
    searching: "جارٍ البحث…",
    errPatient: "اختر المريض.",
    errDoctor: "اختر الطبيب.",
    errSlot: "اختر وقتًا للموعد.",

    qaTitle: "حجز موعد سريع",
    qaClinic: "العيادة",
    qaChooseClinic: "اختر العيادة",
    qaDoctor: "الطبيب",
    qaChooseDoctor: "اختر الطبيب",
    qaDate: "التاريخ",
    qaSlots: "الأوقات المتاحة",
    qaPickDoctor: "اختر العيادة والطبيب أولاً.",
    qaNoSlots: "لا توجد أوقات متاحة في هذا التاريخ.",
    qaNoDoctors: "لا يوجد أطباء لديهم دوام نشط في هذه العيادة.",
    qaReason: "سبب الزيارة (اختياري)",
    qaBook: "حجز الموعد",
    qaBooking: "جارٍ الحجز…",
    qaNoPaymentHint: "لا يتم تحصيل أي مبلغ عند الحجز. تُسوّى الرسوم عند وصول المريض.",

    wiTitle: "زيارة بدون موعد",
    wiHint:
        "يتم إنشاء الزيارة أولاً ثم تُفتح نافذة تسجيل الوصول والدفع. لا يدخل المريض غرفة الانتظار إلا بعد تأكيد الدفع وإصدار فاتورة زاتكا.",
    wiDoctor: "الطبيب",
    wiChooseDoctor: "اختر الطبيب",
    wiOffDuty: "خارج الدوام",
    wiAdd: "إنشاء الزيارة والمتابعة للدفع",
    wiAdding: "جارٍ الإنشاء…",

    elTitle: "فحص أهلية نفيس الفوري",
    elHint: "أدخل رقم الهوية / الإقامة لمريض مسجّل.",
    elNationalId: "رقم الهوية / الإقامة",
    elNationalIdPlaceholder: "رقم من 10 أرقام",
    elInvalidId: "أدخل رقمًا من 10 أرقام يبدأ بـ 1 أو 2.",
    elRun: "فحص الأهلية",
    elRunning: "جارٍ الفحص…",
    elPatient: "المريض",
    elStatus: "النتيجة",
    elPayer: "شركة التأمين",
    elPolicy: "الوثيقة",
    elCopay: "نسبة التحمّل",
    elReference: "المرجع",
    elLatency: "زمن الاستجابة",
    elMode: "وضع نفيس",
    elCashFallback: "وثيقة التأمين غير فعالة — يرجى تحصيل المبلغ نقدًا من المريض.",
    elCopayPercent: "{value}%",
    elCopayFixed: "{value} ريال ثابت",
    elCopayCap: "بحد أقصى {value} ريال",

    ckTitle: "تسجيل الوصول وتسوية الدفع",
    ckHint: "لا ينتقل المريض إلى غرفة الانتظار إلا بعد تأكيد الدفع وإصدار فاتورة زاتكا.",
    ckLoading: "جارٍ جلب سعر الكشفية والتحقق من التغطية وحساب الضريبة…",
    ckStepFee: "سعر الكشفية",
    ckStepCoverage: "التأمين وتغطية نفيس",
    ckStepVat: "ضريبة القيمة المضافة (زاتكا)",
    ckStepPay: "الدفع وفاتورة زاتكا",
    ckConsultationFee: "سعر الكشفية",
    ckInsuranceShare: "حصة التأمين",
    ckPatientShare: "حصة المريض",
    ckVatLine: "ضريبة القيمة المضافة ({rate}%)",
    ckVatExempt: "مواطن سعودي — ضريبة 0% (معفى)",
    ckVatApplied: "غير سعودي — ضريبة 15% على حصة المريض فقط",
    ckTotal: "الإجمالي المستحق",
    ckAmountDue: "المبلغ المطلوب تحصيله من المريض الآن",
    ckCurrency: "ريال",
    ckPayMethod: "طريقة الدفع",
    ckCash: "نقدي",
    ckMada: "شبكة / مدى",
    ckConfirm: "تأكيد الدفع وإصدار الفاتورة",
    ckConfirming: "جارٍ إصدار الفاتورة…",
    ckConverted: "التأمين غير مغطى / منتهي — سيتم التحويل للدفع النقدي الكامل",
    ckCashPatient: "مريض نقدي — الرسوم كاملة مستحقة الآن.",
    ckInsuredEligible: "التأمين مؤهّل ومغطى لدى المركز",
    ckPayer: "شركة التأمين",
    ckIdentity: "الهوية",
    ckIdNational: "مواطن سعودي (هوية وطنية)",
    ckIdIqama: "مقيم / زائر (إقامة)",
    ckStaysScheduled: "إغلاق هذه النافذة دون دفع يُبقي الزيارة بحالة مجدول.",
    ckToastPaid: "تم استلام الدفع — المريض {name} الآن في غرفة الانتظار.",
    ckPrint: "طباعة الإيصال",
    ckNoPaymentDue: "لا يوجد مبلغ مستحق على المريض (تغطية كاملة). سيتم إصدار الفاتورة مع ذلك.",
    ckNphiesRef: "مرجع نفيس",
    ckZatcaEnv: "بيئة الزكاة: {env}",

    invLoading: "جارٍ تحميل الفاتورة الضريبية…",
    invTitle: "فاتورة ضريبية مبسطة",
    invNo: "رقم الفاتورة",
    invDateTime: "التاريخ والوقت",
    invZatca: "حالة الزكاة",
    invReported: "تم الإبلاغ لهيئة الزكاة",
    invPending: "قيد الإبلاغ للزكاة",
    invSimulation: "محاكاة",
    invPatientVisit: "المريض والزيارة",
    invMrn: "رقم الملف الطبي",
    invIdLabel: "الهوية الوطنية / الإقامة",
    invNationality: "الجنسية",
    invSaudi: "سعودي — ضريبة 0% (معفى)",
    invNonSaudi: "غير سعودي (مقيم / زائر) — ضريبة 15% على حصة المريض",
    invDoctor: "الطبيب والعيادة",
    invInsurance: "التأمين",
    invPayer: "شركة التأمين",
    invPolicy: "رقم الوثيقة",
    invCopay: "نسبة التحمّل",
    invCash: "مريض نقدي (غير مؤمَّن)",
    invConverted: "التأمين غير مغطى / منتهي — فوترة نقدية كاملة",
    invMethod: "طريقة الدفع",
    invCode: "الرمز",
    invDescription: "الوصف",
    invUnitPrice: "سعر الوحدة",
    invInsShare: "حصة التأمين",
    invPatShare: "حصة المريض",
    invVat: "الضريبة",
    invLineTotal: "الإجمالي",
    invGross: "الإجمالي قبل التأمين",
    invInsCovered: "المغطى من التأمين",
    invTaxable: "المبلغ الخاضع للضريبة (حصة المريض)",
    invVatRow: "ضريبة القيمة المضافة ({rate}%)",
    invVatExemptRow: "ضريبة القيمة المضافة (0% — معفى للسعوديين)",
    invNet: "صافي المستحق على المريض",
    invScanQr: "امسح الرمز بتطبيق «فاتورة» التابع لهيئة الزكاة",
    invQrLabel: "رمز الاستجابة السريعة للمرحلة الثانية",
    invClaim: "مطالبة نفيس معلّقة",
    invPhone: "خدمة العملاء",
    invThanks: "شكراً لزيارتكم — نتمنى لكم دوام الصحة والعافية",
    invVatNo: "الرقم الضريبي",
    invCrNo: "السجل التجاري",
};

export const messages = { en, ar } as const;
export type Messages = (typeof messages)[Locale];

export function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * Localizes a server-action error: when the action's error `code` has a dedicated message
 * (NO_COVERAGE, PROVIDER_INACTIVE, PAYMENT_REQUIRED, ZATCA_CERT_MISSING, ...), use it; otherwise
 * fall back to the server text, then to the generic failure message.
 */
export function actionErrorMessage(
    t: Messages,
    code: string | undefined,
    fallback: string | undefined,
): string {
    if (code !== undefined && Object.prototype.hasOwnProperty.call(t.codes, code)) {
        return t.codes[code as keyof Messages["codes"]];
    }

    return fallback ?? t.failed;
}

/* ------------------------------ styles ------------------------------ */

export const baseInput =
    "h-11 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 text-sm text-slate-900 dark:text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

export const tealButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const outlineButton =
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 text-sm font-semibold text-slate-900 dark:text-slate-100 transition hover:border-teal-500 hover:text-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const dangerButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const warnButton =
    "inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50";

export const cardSurface =
    "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/60";

/* Custom dropdown (SelectBox) — dark slate surface, teal-500 border on open/focus. */

export const selectTriggerClass =
    "flex h-11 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-start text-sm text-slate-900 outline-none transition-colors duration-150 hover:border-teal-500/60 focus-visible:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";

export const selectTriggerOpenClass = "!border-teal-500 ring-2 ring-teal-500/20";

export const selectPanelClass =
    "z-[160] overflow-y-auto rounded-xl border border-teal-500 bg-white p-1.5 text-sm shadow-2xl shadow-black/40 dark:bg-slate-950";

export const selectOptionClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-slate-800 transition-colors duration-150 dark:text-slate-200";

export const selectOptionSelectedClass =
    "bg-teal-500/15 font-semibold text-teal-700 dark:text-teal-300";

export const selectOptionActiveClass = "bg-teal-500/10";

export const selectGroupLabelClass =
    "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

export const backdropMotion = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.2, ease: "easeOut" },
} as const;

export const panelMotion = {
    initial: { opacity: 0, scale: 0.96, y: 16 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.97, y: 10 },
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
} as const;

/* ----------------------------- formatters ----------------------------- */

function intlTag(locale: Locale): string {
    return locale === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US";
}

export function formatTime(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

export function formatDateTime(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

/** Date + time including seconds (24h), matching the ZATCA signing timestamp on the invoice. */
export function formatDateTimeSeconds(iso: string, timeZone: string, locale: Locale): string {
    try {
        return new Intl.DateTimeFormat(intlTag(locale), {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
        }).format(new Date(iso));
    } catch {
        return iso;
    }
}

/** SAR amounts always show two decimals (e.g. 40.00). */
export function formatMoney(value: number, locale: Locale): string {
    return new Intl.NumberFormat(intlTag(locale), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatLongDate(date: string, locale: Locale): string {
    const [y, m, d] = date.split("-").map(Number);

    return new Intl.DateTimeFormat(intlTag(locale), {
        timeZone: "UTC",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
}

export function relativeTime(iso: string, nowMs: number, locale: Locale): string {
    const seconds = Math.round((new Date(iso).getTime() - nowMs) / 1000);
    const abs = Math.abs(seconds);
    const rtf = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: "auto", style: "narrow" });

    if (abs < 30) return rtf.format(0, "second");
    if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");

    return rtf.format(Math.round(seconds / 86_400), "day");
}

export function displayDoctor(name: string, locale: Locale): string {
    if (/^(dr\.?|د\.?)\s/i.test(name)) return name;

    return locale === "ar" ? `د. ${name}` : `Dr. ${name}`;
}

export function shortRef(reference: string): string {
    return reference.split("-").pop() ?? reference;
}

export function addDaysToDate(date: string, days: number): string {
    const [y, m, d] = date.split("-").map(Number);

    return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* QR Code encoder (ISO/IEC 18004, byte mode, ECC L/M, versions 1-40)  */
/* ------------------------------------------------------------------ */

type QrEcc = "L" | "M";

const QR_ECC_FORMAT_BITS: Record<QrEcc, number> = { L: 1, M: 0 };

const QR_ECC_CODEWORDS_PER_BLOCK: Record<QrEcc, readonly number[]> = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
};

const QR_ECC_BLOCKS: Record<QrEcc, readonly number[]> = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
};

function qrRawDataModules(version: number): number {
    let result = (16 * version + 128) * version + 64;

    if (version >= 2) {
        const alignCount = Math.floor(version / 7) + 2;

        result -= (25 * alignCount - 10) * alignCount - 55;

        if (version >= 7) result -= 36;
    }

    return result;
}

function qrDataCodewords(version: number, ecc: QrEcc): number {
    return (
        Math.floor(qrRawDataModules(version) / 8) -
        (QR_ECC_CODEWORDS_PER_BLOCK[ecc][version] ?? 0) * (QR_ECC_BLOCKS[ecc][version] ?? 0)
    );
}

function rsMultiply(x: number, y: number): number {
    let z = 0;

    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }

    return z;
}

function rsDivisor(degree: number): number[] {
    const result: number[] = new Array<number>(degree - 1).fill(0);

    result.push(1);

    let root = 1;

    for (let i = 0; i < degree; i++) {
        for (let j = 0; j < result.length; j++) {
            result[j] = rsMultiply(result[j] ?? 0, root);

            if (j + 1 < result.length) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
        }

        root = rsMultiply(root, 0x02);
    }

    return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
    const result: number[] = divisor.map(() => 0);

    for (const byte of data) {
        const factor = byte ^ (result.shift() ?? 0);

        result.push(0);
        divisor.forEach((coef, index) => {
            result[index] = (result[index] ?? 0) ^ rsMultiply(coef, factor);
        });
    }

    return result;
}

function qrInterleave(data: readonly number[], version: number, ecc: QrEcc): number[] {
    const blockCount = QR_ECC_BLOCKS[ecc][version] ?? 1;
    const eccLength = QR_ECC_CODEWORDS_PER_BLOCK[ecc][version] ?? 0;
    const rawCodewords = Math.floor(qrRawDataModules(version) / 8);
    const shortBlocks = blockCount - (rawCodewords % blockCount);
    const shortLength = Math.floor(rawCodewords / blockCount);
    const divisor = rsDivisor(eccLength);
    const blocks: number[][] = [];

    for (let i = 0, k = 0; i < blockCount; i++) {
        const chunk = data.slice(k, k + shortLength - eccLength + (i < shortBlocks ? 0 : 1));

        k += chunk.length;

        const check = rsRemainder(chunk, divisor);

        if (i < shortBlocks) chunk.push(0);

        blocks.push(chunk.concat(check));
    }

    const result: number[] = [];

    for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
        blocks.forEach((block, j) => {
            if (i !== shortLength - eccLength || j >= shortBlocks) result.push(block[i] ?? 0);
        });
    }

    return result;
}

function qrAlignmentPositions(version: number): number[] {
    if (version === 1) return [];

    const count = Math.floor(version / 7) + 2;
    const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
    const result = [6];

    for (let position = version * 4 + 10; result.length < count; position -= step) {
        result.splice(1, 0, position);
    }

    return result;
}

function bitAt(value: number, index: number): boolean {
    return ((value >>> index) & 1) !== 0;
}

class QrMatrix {
    readonly size: number;
    readonly modules: boolean[][];
    private readonly reserved: boolean[][];

    constructor(
        readonly version: number,
        readonly ecc: QrEcc,
        codewords: readonly number[],
    ) {
        this.size = version * 4 + 17;
        this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
        this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));

        this.drawFunctionPatterns();
        this.drawCodewords(codewords);

        let bestMask = 0;
        let bestPenalty = Number.POSITIVE_INFINITY;

        for (let mask = 0; mask < 8; mask++) {
            this.applyMask(mask);
            this.drawFormatBits(mask);

            const penalty = this.penalty();

            if (penalty < bestPenalty) {
                bestPenalty = penalty;
                bestMask = mask;
            }

            this.applyMask(mask);
        }

        this.applyMask(bestMask);
        this.drawFormatBits(bestMask);
    }

    private setFunction(x: number, y: number, dark: boolean): void {
        const row = this.modules[y];
        const lock = this.reserved[y];

        if (!row || !lock) return;

        row[x] = dark;
        lock[x] = true;
    }

    private drawFunctionPatterns(): void {
        for (let i = 0; i < this.size; i++) {
            this.setFunction(6, i, i % 2 === 0);
            this.setFunction(i, 6, i % 2 === 0);
        }

        this.drawFinder(3, 3);
        this.drawFinder(this.size - 4, 3);
        this.drawFinder(3, this.size - 4);

        const positions = qrAlignmentPositions(this.version);

        positions.forEach((px, i) => {
            positions.forEach((py, j) => {
                const corner =
                    (i === 0 && j === 0) ||
                    (i === 0 && j === positions.length - 1) ||
                    (i === positions.length - 1 && j === 0);

                if (!corner) this.drawAlignment(px, py);
            });
        });

        this.drawFormatBits(0);
        this.drawVersion();
    }

    private drawFinder(cx: number, cy: number): void {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const distance = Math.max(Math.abs(dx), Math.abs(dy));
                const x = cx + dx;
                const y = cy + dy;

                if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
                    this.setFunction(x, y, distance !== 2 && distance !== 4);
                }
            }
        }
    }

    private drawAlignment(cx: number, cy: number): void {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
            }
        }
    }

    private drawFormatBits(mask: number): void {
        const data = (QR_ECC_FORMAT_BITS[this.ecc] << 3) | mask;
        let remainder = data;

        for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);

        const bits = ((data << 10) | remainder) ^ 0x5412;

        for (let i = 0; i <= 5; i++) this.setFunction(8, i, bitAt(bits, i));

        this.setFunction(8, 7, bitAt(bits, 6));
        this.setFunction(8, 8, bitAt(bits, 7));
        this.setFunction(7, 8, bitAt(bits, 8));

        for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bitAt(bits, i));
        for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, bitAt(bits, i));
        for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, bitAt(bits, i));

        this.setFunction(8, this.size - 8, true);
    }

    private drawVersion(): void {
        if (this.version < 7) return;

        let remainder = this.version;

        for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);

        const bits = (this.version << 12) | remainder;

        for (let i = 0; i < 18; i++) {
            const a = this.size - 11 + (i % 3);
            const b = Math.floor(i / 3);

            this.setFunction(a, b, bitAt(bits, i));
            this.setFunction(b, a, bitAt(bits, i));
        }
    }

    private drawCodewords(codewords: readonly number[]): void {
        let index = 0;

        for (let right = this.size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;

            for (let vertical = 0; vertical < this.size; vertical++) {
                for (let j = 0; j < 2; j++) {
                    const x = right - j;
                    const upward = ((right + 1) & 2) === 0;
                    const y = upward ? this.size - 1 - vertical : vertical;

                    if (!this.reserved[y]?.[x] && index < codewords.length * 8) {
                        const row = this.modules[y];

                        if (row) row[x] = bitAt(codewords[index >>> 3] ?? 0, 7 - (index & 7));

                        index++;
                    }
                }
            }
        }
    }

    private applyMask(mask: number): void {
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                let invert: boolean;

                switch (mask) {
                    case 0:
                        invert = (x + y) % 2 === 0;
                        break;
                    case 1:
                        invert = y % 2 === 0;
                        break;
                    case 2:
                        invert = x % 3 === 0;
                        break;
                    case 3:
                        invert = (x + y) % 3 === 0;
                        break;
                    case 4:
                        invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
                        break;
                    case 5:
                        invert = ((x * y) % 2) + ((x * y) % 3) === 0;
                        break;
                    case 6:
                        invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
                        break;
                    default:
                        invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
                        break;
                }

                const row = this.modules[y];

                if (row && !this.reserved[y]?.[x] && invert) row[x] = !row[x];
            }
        }
    }

    private penalty(): number {
        const n = this.size;
        let result = 0;
        const lines: boolean[][] = [];

        for (let i = 0; i < n; i++) {
            lines.push(this.modules[i] ?? []);
            lines.push(this.modules.map((row) => row[i] ?? false));
        }

        const finderA = [true, false, true, true, true, false, true, false, false, false, false];
        const finderB = [false, false, false, false, true, false, true, true, true, false, true];

        for (const line of lines) {
            let run = 1;

            for (let i = 1; i < n; i++) {
                if (line[i] === line[i - 1]) {
                    run++;

                    if (run === 5) result += 3;
                    else if (run > 5) result += 1;
                } else {
                    run = 1;
                }
            }

            for (let i = 0; i + 11 <= n; i++) {
                const slice = line.slice(i, i + 11);

                if (slice.every((v, k) => v === finderA[k]) || slice.every((v, k) => v === finderB[k])) {
                    result += 40;
                }
            }
        }

        let dark = 0;

        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                if (this.modules[y]?.[x]) dark++;

                if (
                    x + 1 < n &&
                    y + 1 < n &&
                    this.modules[y]?.[x] === this.modules[y]?.[x + 1] &&
                    this.modules[y]?.[x] === this.modules[y + 1]?.[x] &&
                    this.modules[y]?.[x] === this.modules[y + 1]?.[x + 1]
                ) {
                    result += 3;
                }
            }
        }

        const total = n * n;

        result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;

        return result;
    }
}

function qrEncodeBytes(bytes: readonly number[], ecc: QrEcc): QrMatrix | null {
    for (let version = 1; version <= 40; version++) {
        const capacityBits = qrDataCodewords(version, ecc) * 8;
        const countBits = version <= 9 ? 8 : 16;
        const usedBits = 4 + countBits + bytes.length * 8;

        if (usedBits > capacityBits) continue;

        const bits: number[] = [];
        const push = (value: number, length: number) => {
            for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
        };

        push(0b0100, 4);
        push(bytes.length, countBits);
        bytes.forEach((byte) => push(byte, 8));
        push(0, Math.min(4, capacityBits - bits.length));

        while (bits.length % 8 !== 0) bits.push(0);

        for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

        const data: number[] = [];

        for (let i = 0; i < bits.length; i += 8) {
            let value = 0;

            for (let k = 0; k < 8; k++) value = (value << 1) | (bits[i + k] ?? 0);

            data.push(value);
        }

        return new QrMatrix(version, ecc, qrInterleave(data, version, ecc));
    }

    return null;
}

export interface QrSvgData {
    /** Side length in modules, including the 4-module quiet zone. */
    size: number;
    /** SVG path (`d`) covering every dark module; unit = 1 module. */
    path: string;
}

/**
 * Encodes `text` (UTF-8, byte mode) as a QR code and returns an SVG path. ECC level M is used
 * (more robust when printed); very large payloads fall back to level L. Returns null when the
 * text does not fit in a version 40 symbol. The ZATCA Phase 2 payload (base64 TLV) is scannable
 * by the ZATCA "Fatoora" reader app.
 */
export function buildQrSvg(text: string): QrSvgData | null {
    const bytes = Array.from(new TextEncoder().encode(text));
    let matrix = qrEncodeBytes(bytes, "M");

    if (matrix && matrix.version > 20) matrix = qrEncodeBytes(bytes, "L") ?? matrix;

    if (!matrix) matrix = qrEncodeBytes(bytes, "L");

    if (!matrix) return null;

    const quiet = 4;
    const segments: string[] = [];

    for (let y = 0; y < matrix.size; y++) {
        let x = 0;

        while (x < matrix.size) {
            if (!matrix.modules[y]?.[x]) {
                x++;
                continue;
            }

            let end = x;

            while (end < matrix.size && matrix.modules[y]?.[end]) end++;

            segments.push(`M${x + quiet} ${y + quiet}h${end - x}v1h${x - end}z`);
            x = end;
        }
    }

    return { size: matrix.size + quiet * 2, path: segments.join("") };
}