import { CATEGORIES } from "@/lib/categories";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const CATEGORY_SLUGS = new Set(CATEGORIES.map((c) => c.slug));

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function hasControlChars(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  if (hasControlChars(trimmed)) return false;
  return EMAIL_REGEX.test(trimmed);
}

export function isValidCategorySlug(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return CATEGORY_SLUGS.has(value.trim().toLowerCase());
}

/**
 * Sanitizes search input for safe interpolation into PostgREST `.or()` filters.
 * Strips filter-operator syntax characters `( ) , .` and escapes SQL LIKE wildcards.
 */
export function sanitizePostgrestSearch(raw: string): string {
  return raw
    .trim()
    .slice(0, 100)
    .replace(/[(),.'"`;]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\s+/g, " ")
    .trim();
}

function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    lower === "localhost" ||
    lower === "127.0.0.1" ||
    lower === "::1" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal")
  ) {
    return true;
  }

  // Block private IPv4 ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that an image URL is either a safe public HTTPS image URL
 * or (when allowDataUrl is true) a safe raster base64 data URI.
 * Blocks `javascript:`, `blob:`, `data:text/html`, `data:image/svg+xml`, and private IPs.
 */
export function validateSafeImageUrl(
  rawUrl: unknown,
  allowDataUrl = false
): { valid: boolean; value: string | null; error?: string } {
  if (rawUrl === null || rawUrl === undefined || rawUrl === "") {
    return { valid: true, value: null };
  }

  if (typeof rawUrl !== "string") {
    return { valid: false, value: null, error: "Invalid image URL format" };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: true, value: null };
  }

  if (hasControlChars(trimmed)) {
    return { valid: false, value: null, error: "Invalid characters in image URL" };
  }

  if (trimmed.startsWith("data:")) {
    if (!allowDataUrl) {
      return {
        valid: false,
        value: null,
        error: "Inline data URLs are not accepted; upload the image first",
      };
    }

    const safeDataRegex =
      /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
    if (!safeDataRegex.test(trimmed) || trimmed.length > 7_500_000) {
      return {
        valid: false,
        value: null,
        error: "Unsupported or oversized inline image data",
      };
    }

    return { valid: true, value: trimmed };
  }

  if (trimmed.length > 2048) {
    return { valid: false, value: null, error: "Image URL is too long" };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return {
        valid: false,
        value: null,
        error: "Image URL must use HTTPS",
      };
    }

    if (parsed.username || parsed.password) {
      return {
        valid: false,
        value: null,
        error: "Image URL must not contain credentials",
      };
    }

    if (isPrivateOrLoopbackHostname(parsed.hostname)) {
      return {
        valid: false,
        value: null,
        error: "Image URL hostname is not permitted",
      };
    }

    return { valid: true, value: parsed.toString() };
  } catch {
    return { valid: false, value: null, error: "Invalid image URL" };
  }
}

/**
 * Checks whether a stored image URL is safe to render in `<img src>` on the client.
 */
export function isSafeDisplayImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith("https://")) return true;
  if (
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Masks an email address for public display (e.g. "aubiebryne@gmail.com" -> "au***@gmail.com").
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "Buyer";
  const prefix = localPart.slice(0, Math.min(2, localPart.length));
  return `${prefix}***@${domain}`;
}

export interface DetectedImageFormat {
  ext: "jpg" | "png" | "gif" | "webp";
  mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
}

/**
 * Inspects binary magic bytes of an uploaded file buffer to verify it is a genuine raster image.
 */
export function detectImageFormatFromBytes(
  bytes: Uint8Array
): DetectedImageFormat | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
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

  // GIF: GIF87a or GIF89a
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { ext: "gif", mime: "image/gif" };
  }

  // WebP: RIFF....WEBP
  if (
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

  return null;
}
