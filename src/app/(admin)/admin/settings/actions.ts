"use server";

import { CenterFacilityType, Prisma, type CenterSettings } from "@prisma/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { requirePortalSession } from "@/lib/auth/guard";

/**
 * Center Settings — Server Actions
 * --------------------------------
 * - Tenant isolation: every query is scoped by session.organizationId; asset URLs are only
 *   accepted when they point at THIS organization's folder in the branding bucket.
 * - ZATCA: VAT number must be 15 digits, start and end with 3; national address fields follow
 *   the Saudi National Address format (5-digit postal code, 4-digit building/additional number).
 * - NPHIES / MOH: identifiers are normalised to upper-case and validated; they are globally
 *   unique so one facility cannot be registered by two tenants.
 * - Concurrency: `version` is checked on every update so two admins cannot silently overwrite
 *   each other.
 * - No revalidatePath on purpose: the client page owns its data and applies changes
 *   optimistically; a revalidation would only make each action response heavier.
 * - Uploads travel through Server Actions, whose default body limit is 1 MB. Limits below stay
 *   under it. Raise experimental.serverActions.bodySizeLimit in next.config if you need more.
 */

const BRANDING_BUCKET = "center-branding";
const MAX_LOGO_BYTES = 900 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;

export type CenterSettingsFieldKey =
    | "logoUrl"
    | "faviconUrl"
    | "tradeNameAr"
    | "tradeNameEn"
    | "taxRegistrationNumber"
    | "streetName"
    | "district"
    | "city"
    | "postalCode"
    | "additionalNumber"
    | "buildingNumber"
    | "mohLicenseNumber"
    | "nphiesFacilityId"
    | "facilityType"
    | "phone"
    | "email"
    | "websiteUrl";

export interface CenterSettingsFields {
    logoUrl: string;
    faviconUrl: string;
    tradeNameAr: string;
    tradeNameEn: string;
    taxRegistrationNumber: string;
    streetName: string;
    district: string;
    city: string;
    postalCode: string;
    additionalNumber: string;
    buildingNumber: string;
    mohLicenseNumber: string;
    nphiesFacilityId: string;
    facilityType: CenterFacilityType | "";
    phone: string;
    email: string;
    websiteUrl: string;
}

export interface CenterSettingsData extends CenterSettingsFields {
    /** 0 means the center has no saved settings yet. */
    version: number;
    updatedAt: string | null;
}

export interface SaveCenterSettingsInput extends CenterSettingsFields {
    expectedVersion: number;
}

export interface CenterSettingsActionResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    fieldErrors?: Partial<Record<CenterSettingsFieldKey, string>>;
}

type FieldErrors = Partial<Record<CenterSettingsFieldKey, string>>;

/* ------------------------------ patterns ------------------------------ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAX_NUMBER_PATTERN = /^3\d{13}3$/;
const POSTAL_PATTERN = /^\d{5}$/;
const FOUR_DIGITS_PATTERN = /^\d{4}$/;
const IDENTIFIER_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{2,49}$/;
const EN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/-]{1,119}$/;
const AR_NAME_PATTERN =
    /^[\u0600-\u06FF\u0750-\u077FA-Za-z0-9][\u0600-\u06FF\u0750-\u077FA-Za-z0-9 \u200F.,&'()/-]{1,119}$/;
const ARABIC_LETTER_PATTERN = /[\u0600-\u06FF]/;
const ADDRESS_TEXT_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'/()-]{0,126}$/u;
const PHONE_PATTERN = /^\+966(?:5\d{8}|1[1-7]\d{7}|92\d{7})$/;
const ASSET_FILE_PATTERN = /^(logo|favicon)-[0-9a-f-]{36}\.(png|jpg|webp|ico)$/;

const VALID_FACILITY_TYPES = new Set<string>(Object.values(CenterFacilityType));

/* ------------------------------ helpers ------------------------------ */

function cleanText(value: unknown): string {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeDigits(value: string): string {
    return value
        .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function digitsOnly(value: unknown): string {
    return normalizeDigits(typeof value === "string" ? value : "").replace(/\D/g, "");
}

function normalizePhone(raw: string): string | null {
    let value = normalizeDigits(raw).replace(/[\s().-]/g, "");

    if (value.startsWith("00966")) {
        value = `+${value.slice(2)}`;
    } else if (value.startsWith("966")) {
        value = `+${value}`;
    } else if (/^0[15]\d{8}$/.test(value)) {
        value = `+966${value.slice(1)}`;
    } else if (/^[15]\d{8}$/.test(value)) {
        value = `+966${value}`;
    }

    return PHONE_PATTERN.test(value) ? value : null;
}

/** Returns "" for an empty value, null when the value is not a valid http(s) URL. */
function normalizeWebsite(raw: string): string | null {
    const value = raw.trim();

    if (!value) return "";
    if (/\s/.test(value)) return null;

    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

    try {
        const url = new URL(candidate);

        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        if (!url.hostname.includes(".")) return null;

        const normalized =
            url.pathname === "/" && !url.search && !url.hash ? url.origin : url.toString();

        return normalized.length <= 255 ? normalized : null;
    } catch {
        return null;
    }
}

function supabaseOrigin(): string {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;

    if (!configured) {
        throw new Error("SUPABASE_URL is not configured.");
    }

    return new URL(configured).origin;
}

function assetPrefix(organizationId: string): string {
    return `${supabaseOrigin()}/storage/v1/object/public/${BRANDING_BUCKET}/${organizationId}/`;
}

/** An asset URL is accepted only if it points at this organization's own branding folder. */
function isOwnedAssetUrl(
    value: string,
    organizationId: string,
    kind: "logo" | "favicon",
): boolean {
    const prefix = assetPrefix(organizationId);

    if (!value.startsWith(prefix) || value.length > 512) return false;

    const fileName = value.slice(prefix.length);
    const match = ASSET_FILE_PATTERN.exec(fileName);

    return Boolean(match && match[1] === kind);
}

let storageClient: SupabaseClient | null = null;

function getStorageClient(): SupabaseClient {
    if (storageClient) return storageClient;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error("Supabase storage is not configured.");
    }

    storageClient = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return storageClient;
}

type SniffedImage = { ext: "png" | "jpg" | "webp" | "ico"; mime: string };

function sniffImage(bytes: Uint8Array): SniffedImage | null {
    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return { ext: "png", mime: "image/png" };
    }

    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return { ext: "jpg", mime: "image/jpeg" };
    }

    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return { ext: "webp", mime: "image/webp" };
    }

    if (
        bytes.length >= 4 &&
        bytes[0] === 0x00 &&
        bytes[1] === 0x00 &&
        bytes[2] === 0x01 &&
        bytes[3] === 0x00
    ) {
        return { ext: "ico", mime: "image/x-icon" };
    }

    return null;
}

function failure<T>(
    error: string,
    code = "INVALID_INPUT",
    fieldErrors?: FieldErrors,
): CenterSettingsActionResult<T> {
    return { success: false, error, code, ...(fieldErrors ? { fieldErrors } : {}) };
}

function uniqueViolationFields(error: Prisma.PrismaClientKnownRequestError): FieldErrors {
    const meta = error.meta as { target?: string | string[] } | undefined;
    const target = String(meta?.target ?? "").toLowerCase();
    const fields: FieldErrors = {};

    if (target.includes("tax")) {
        fields.taxRegistrationNumber =
            "This tax registration number is already registered to another center.";
    }
    if (target.includes("moh")) {
        fields.mohLicenseNumber = "This MOH license number is already registered.";
    }
    if (target.includes("nphies")) {
        fields.nphiesFacilityId = "This NPHIES facility ID is already registered.";
    }

    return fields;
}

function databaseError<T>(action: string, error: unknown): CenterSettingsActionResult<T> {
    console.error(`[${action}]`, error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
            const fieldErrors = uniqueViolationFields(error);

            if (Object.keys(fieldErrors).length > 0) {
                return failure(
                    "One of the identifiers is already registered to another center.",
                    "DUPLICATE_RECORD",
                    fieldErrors,
                );
            }

            return failure(
                "The settings were changed by someone else. Reload and try again.",
                "CONFLICT",
            );
        }

        if (error.code === "P2025") {
            return failure(
                "The requested record could not be found. Refresh and try again.",
                "RECORD_NOT_FOUND",
            );
        }
    }

    return failure(
        "The operation could not be completed. Please try again.",
        "DATABASE_ERROR",
    );
}

function mapRow(row: CenterSettings): CenterSettingsData {
    return {
        version: row.version,
        updatedAt: row.updatedAt.toISOString(),
        logoUrl: row.logoUrl ?? "",
        faviconUrl: row.faviconUrl ?? "",
        tradeNameAr: row.tradeNameAr ?? "",
        tradeNameEn: row.tradeNameEn ?? "",
        taxRegistrationNumber: row.taxRegistrationNumber ?? "",
        streetName: row.streetName ?? "",
        district: row.district ?? "",
        city: row.city ?? "",
        postalCode: row.postalCode ?? "",
        additionalNumber: row.additionalNumber ?? "",
        buildingNumber: row.buildingNumber ?? "",
        mohLicenseNumber: row.mohLicenseNumber ?? "",
        nphiesFacilityId: row.nphiesFacilityId ?? "",
        facilityType: row.facilityType ?? "",
        phone: row.phone ?? "",
        email: row.email ?? "",
        websiteUrl: row.websiteUrl ?? "",
    };
}

function emptyData(): CenterSettingsData {
    return {
        version: 0,
        updatedAt: null,
        logoUrl: "",
        faviconUrl: "",
        tradeNameAr: "",
        tradeNameEn: "",
        taxRegistrationNumber: "",
        streetName: "",
        district: "",
        city: "",
        postalCode: "",
        additionalNumber: "",
        buildingNumber: "",
        mohLicenseNumber: "",
        nphiesFacilityId: "",
        facilityType: "",
        phone: "",
        email: "",
        websiteUrl: "",
    };
}

type ParsedSettings = {
    logoUrl: string | null;
    faviconUrl: string | null;
    tradeNameAr: string;
    tradeNameEn: string;
    taxRegistrationNumber: string;
    streetName: string;
    district: string;
    city: string;
    postalCode: string;
    additionalNumber: string;
    buildingNumber: string;
    mohLicenseNumber: string;
    nphiesFacilityId: string;
    facilityType: CenterFacilityType;
    phone: string;
    email: string;
    websiteUrl: string | null;
};

function parseInput(
    input: SaveCenterSettingsInput,
    organizationId: string,
): { ok: true; value: ParsedSettings } | { ok: false; fieldErrors: FieldErrors } {
    const errors: FieldErrors = {};

    const tradeNameAr = cleanText(input?.tradeNameAr);
    const tradeNameEn = cleanText(input?.tradeNameEn);
    const taxRegistrationNumber = digitsOnly(input?.taxRegistrationNumber);
    const streetName = cleanText(input?.streetName);
    const district = cleanText(input?.district);
    const city = cleanText(input?.city);
    const postalCode = digitsOnly(input?.postalCode);
    const additionalNumber = digitsOnly(input?.additionalNumber);
    const buildingNumber = digitsOnly(input?.buildingNumber);
    const mohLicenseNumber = cleanText(input?.mohLicenseNumber).toUpperCase();
    const nphiesFacilityId = cleanText(input?.nphiesFacilityId).toUpperCase();
    const facilityType = cleanText(input?.facilityType);
    const email = cleanText(input?.email).toLowerCase();
    const logoUrl = cleanText(input?.logoUrl);
    const faviconUrl = cleanText(input?.faviconUrl);
    const phone = normalizePhone(typeof input?.phone === "string" ? input.phone : "");
    const websiteUrl = normalizeWebsite(typeof input?.websiteUrl === "string" ? input.websiteUrl : "");

    if (!AR_NAME_PATTERN.test(tradeNameAr) || !ARABIC_LETTER_PATTERN.test(tradeNameAr)) {
        errors.tradeNameAr = "Enter the center trade name in Arabic (2–120 characters).";
    }

    if (!EN_NAME_PATTERN.test(tradeNameEn)) {
        errors.tradeNameEn = "Enter the center trade name in English (2–120 characters).";
    }

    if (!TAX_NUMBER_PATTERN.test(taxRegistrationNumber)) {
        errors.taxRegistrationNumber =
            "Enter a valid 15-digit tax registration number that starts and ends with 3.";
    }

    if (!ADDRESS_TEXT_PATTERN.test(streetName)) {
        errors.streetName = "Enter a valid street name.";
    }

    if (!ADDRESS_TEXT_PATTERN.test(district)) {
        errors.district = "Enter a valid district.";
    }

    if (!ADDRESS_TEXT_PATTERN.test(city)) {
        errors.city = "Enter a valid city.";
    }

    if (!POSTAL_PATTERN.test(postalCode)) {
        errors.postalCode = "Postal code must be 5 digits.";
    }

    if (!FOUR_DIGITS_PATTERN.test(additionalNumber)) {
        errors.additionalNumber = "Additional number must be 4 digits.";
    }

    if (!FOUR_DIGITS_PATTERN.test(buildingNumber)) {
        errors.buildingNumber = "Building number must be 4 digits.";
    }

    if (!IDENTIFIER_PATTERN.test(mohLicenseNumber)) {
        errors.mohLicenseNumber = "Enter a valid MOH license number.";
    }

    if (!IDENTIFIER_PATTERN.test(nphiesFacilityId)) {
        errors.nphiesFacilityId = "Enter a valid NPHIES facility ID.";
    }

    if (!VALID_FACILITY_TYPES.has(facilityType)) {
        errors.facilityType = "Select a facility type.";
    }

    if (!phone) {
        errors.phone = "Enter a valid Saudi phone number with country code (+966).";
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.email = "Enter a valid official email address.";
    }

    if (websiteUrl === null) {
        errors.websiteUrl = "Enter a valid website URL.";
    }

    if (logoUrl && !isOwnedAssetUrl(logoUrl, organizationId, "logo")) {
        errors.logoUrl = "The logo must be uploaded through Center Settings.";
    }

    if (faviconUrl && !isOwnedAssetUrl(faviconUrl, organizationId, "favicon")) {
        errors.faviconUrl = "The favicon must be uploaded through Center Settings.";
    }

    if (Object.keys(errors).length > 0 || !phone) {
        return { ok: false, fieldErrors: errors };
    }

    return {
        ok: true,
        value: {
            logoUrl: logoUrl || null,
            faviconUrl: faviconUrl || null,
            tradeNameAr,
            tradeNameEn,
            taxRegistrationNumber,
            streetName,
            district,
            city,
            postalCode,
            additionalNumber,
            buildingNumber,
            mohLicenseNumber,
            nphiesFacilityId,
            facilityType: facilityType as CenterFacilityType,
            phone,
            email,
            websiteUrl: websiteUrl || null,
        },
    };
}

/** Best-effort removal of branding files that are no longer referenced. Never throws. */
async function removeReplacedAssets(
    organizationId: string,
    previous: Array<string | null | undefined>,
    next: Array<string | null>,
): Promise<void> {
    try {
        const prefix = assetPrefix(organizationId);
        const keep = new Set(next.filter((value): value is string => Boolean(value)));
        const paths = previous
            .filter((value): value is string => Boolean(value))
            .filter((value) => value.startsWith(prefix) && !keep.has(value))
            .map((value) => `${organizationId}/${value.slice(prefix.length)}`);

        if (paths.length === 0) return;

        await getStorageClient().storage.from(BRANDING_BUCKET).remove(paths);
    } catch (error) {
        console.error("[removeReplacedAssets]", error);
    }
}

/* ------------------------------- actions ------------------------------- */

export async function getCenterSettingsAction(): Promise<
    CenterSettingsActionResult<CenterSettingsData>
> {
    try {
        const session = await requirePortalSession("admin");

        const row = await prisma.centerSettings.findUnique({
            where: { organizationId: session.organizationId },
        });

        return { success: true, data: row ? mapRow(row) : emptyData() };
    } catch (error) {
        return databaseError("getCenterSettingsAction", error);
    }
}

export async function uploadCenterAssetAction(
    formData: FormData,
): Promise<CenterSettingsActionResult<{ url: string }>> {
    try {
        const session = await requirePortalSession("admin");

        const kind = formData.get("kind");
        const file = formData.get("file");

        if ((kind !== "logo" && kind !== "favicon") || !(file instanceof File)) {
            return failure("Choose an image to upload.", "INVALID_FILE");
        }

        const maxBytes = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;

        if (file.size === 0 || file.size > maxBytes) {
            return failure(
                `The image must be smaller than ${Math.round(maxBytes / 1024)} KB.`,
                "FILE_TOO_LARGE",
            );
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const sniffed = sniffImage(bytes);

        if (!sniffed || (kind === "logo" && sniffed.ext === "ico")) {
            return failure(
                kind === "logo"
                    ? "The logo must be a PNG, JPEG or WebP image."
                    : "The favicon must be a PNG, JPEG, WebP or ICO image.",
                "INVALID_FILE_TYPE",
            );
        }

        const path = `${session.organizationId}/${kind}-${randomUUID()}.${sniffed.ext}`;
        const storage = getStorageClient().storage.from(BRANDING_BUCKET);

        const { error } = await storage.upload(path, bytes, {
            contentType: sniffed.mime,
            cacheControl: "31536000",
            upsert: false,
        });

        if (error) {
            console.error("[uploadCenterAssetAction]", error);
            return failure("The image could not be uploaded. Please try again.", "UPLOAD_FAILED");
        }

        const { data } = storage.getPublicUrl(path);

        return { success: true, data: { url: data.publicUrl } };
    } catch (error) {
        return databaseError("uploadCenterAssetAction", error);
    }
}

export async function saveCenterSettingsAction(
    input: SaveCenterSettingsInput,
): Promise<CenterSettingsActionResult<CenterSettingsData>> {
    try {
        const session = await requirePortalSession("admin");
        const organizationId = session.organizationId;

        const parsed = parseInput(input, organizationId);

        if (!parsed.ok) {
            return failure(
                "Review the highlighted fields and try again.",
                "INVALID_INPUT",
                parsed.fieldErrors,
            );
        }

        const expectedVersion = input?.expectedVersion;

        if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
            return failure("Reload the page and try again.", "INVALID_VERSION");
        }

        const values = parsed.value;
        let row: CenterSettings;
        let previousAssets: Array<string | null | undefined> = [];

        if (expectedVersion === 0) {
            row = await prisma.centerSettings.create({
                data: { organizationId, ...values },
            });
        } else {
            const existing = await prisma.centerSettings.findUnique({
                where: { organizationId },
                select: { logoUrl: true, faviconUrl: true },
            });

            previousAssets = [existing?.logoUrl, existing?.faviconUrl];

            const updated = await prisma.centerSettings.updateMany({
                where: { organizationId, version: expectedVersion },
                data: { ...values, version: { increment: 1 } },
            });

            if (updated.count === 0) {
                return failure(
                    "These settings were changed by someone else. Reload the page to see the latest version.",
                    "CONFLICT",
                );
            }

            row = await prisma.centerSettings.findUniqueOrThrow({
                where: { organizationId },
            });
        }

        void removeReplacedAssets(organizationId, previousAssets, [
            values.logoUrl,
            values.faviconUrl,
        ]);

        return { success: true, data: mapRow(row) };
    } catch (error) {
        return databaseError("saveCenterSettingsAction", error);
    }
}