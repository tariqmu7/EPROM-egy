// ============================================================================
// Upload safety — the one place that decides whether a file the user picked is
// allowed into the system, and in what shape.
//
// ECMS has no object storage: every attachment (certificate scan, evidence
// file, exam sheet, avatar) is base64-encoded into a `data:` URL and stored
// inside the document itself. That makes three things matter far more than in
// an app with a real upload endpoint:
//
//   1. SIZE — the whole document travels as JSON through a 5 MB body limit, and
//      base64 inflates bytes by ~33%. An unbounded file is a failed save with a
//      cryptic 413, or a DB row nobody can load. So the cap is enforced HERE,
//      before the read, with a message a person can act on.
//   2. TYPE — `accept=".pdf,image/*"` is a file-picker hint, nothing more. The
//      type is decided by the file's MAGIC BYTES, never by its name or the
//      browser-declared MIME, and the data URL we build carries the DETECTED
//      type. So a renamed .html can never come back out of the database
//      claiming to be a PDF.
//   3. SVG IS NOT AN ATTACHMENT. It can carry script. The generated initials
//      avatar is an `image/svg+xml` data URL and is the one exception — it is
//      produced by us, never uploaded, and only ever rendered in an <img>.
//
// The server enforces the same allowlist independently (see
// `server/src/collections/schemas.ts`) — this half is the friendly error.
// ============================================================================

/** Attachments (certificates, evidence, exam sheets). ~3 MB raw ⇒ ~4 MB base64. */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
/** Avatars are re-encoded to a 200×200 WebP before storage, so the input can be bigger. */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Bulk-import workbooks are parsed in the browser and never stored. */
export const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
/** A bulk-import sheet longer than this is a mistake, not an import. */
export const MAX_IMPORT_ROWS = 5000;

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const ALLOWED_ATTACHMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'] as const;

export type DetectedType = (typeof ALLOWED_ATTACHMENT_TYPES)[number];

/** `accept` attributes — a picker hint only; the checks above are the real gate. */
export const ACCEPT_ATTACHMENT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';
export const ACCEPT_IMAGE = 'image/png,image/jpeg,image/webp,image/gif';
export const ACCEPT_SPREADSHEET = '.xlsx,.xls';

const ascii = (s: string): number[] => [...s].map(c => c.charCodeAt(0));

// Magic-byte signatures. `offset` is where the bytes must appear.
const SIGNATURES: { mime: DetectedType; offset: number; bytes: number[]; also?: { offset: number; bytes: number[] } }[] = [
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', offset: 0, bytes: ascii('GIF8') },
  // WebP is a RIFF container: "RIFF" <4-byte size> "WEBP".
  { mime: 'image/webp', offset: 0, bytes: ascii('RIFF'), also: { offset: 8, bytes: ascii('WEBP') } },
  { mime: 'application/pdf', offset: 0, bytes: ascii('%PDF') },
];

const matches = (bytes: Uint8Array, offset: number, expected: number[]): boolean =>
  expected.every((b, i) => bytes[offset + i] === b);

/** The real type of these bytes, or `null` if it is not one we accept. */
export function detectFileType(bytes: Uint8Array): DetectedType | null {
  for (const sig of SIGNATURES) {
    if (!matches(bytes, sig.offset, sig.bytes)) continue;
    if (sig.also && !matches(bytes, sig.also.offset, sig.also.bytes)) continue;
    return sig.mime;
  }
  return null;
}

const HUMAN: Record<DetectedType, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'application/pdf': 'PDF',
};

const mb = (bytes: number): string => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** Thrown for every rejection here, so callers can show `err.message` as-is. */
export class UploadRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadRejectedError';
  }
}

// btoa() over a big string blows the argument limit, so encode in chunks.
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export interface ValidatedUpload {
  dataUrl: string;
  mime: DetectedType;
  size: number;
}

/**
 * Read a picked file as a `data:` URL, refusing anything that is not an
 * allowlisted type or is over the size cap. The returned URL always carries the
 * DETECTED type, not the one the browser claimed.
 */
export async function readValidatedUpload(
  file: File,
  opts: { maxBytes?: number; allowed?: readonly DetectedType[] } = {},
): Promise<ValidatedUpload> {
  const maxBytes = opts.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const allowed = opts.allowed ?? ALLOWED_ATTACHMENT_TYPES;

  if (file.size === 0) {
    throw new UploadRejectedError('That file is empty.');
  }
  if (file.size > maxBytes) {
    throw new UploadRejectedError(
      `That file is ${mb(file.size)}. The limit is ${mb(maxBytes)} — please compress it or upload a smaller scan.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectFileType(bytes);
  const allowedNames = allowed.map(t => HUMAN[t]).join(', ');
  if (!mime || !allowed.includes(mime)) {
    throw new UploadRejectedError(
      `That file is not a ${allowedNames}. Only ${allowedNames} files can be uploaded — check the file itself, not just its name.`,
    );
  }

  return { dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`, mime, size: file.size };
}

/**
 * The stored display name for an upload. The client filename is attacker text:
 * it is shown in lists and handed to `<a download=…>`, so strip directory
 * separators, control characters and leading dots, and bound the length. It is
 * metadata only — nothing on disk is ever named from it.
 */
export function safeFileName(name: string, fallback = 'attachment'): string {
  const cleaned = (name.split(/[\\/]/).pop() ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** Size + magic-byte check only, for a file that is re-encoded rather than stored raw (avatars). */
export async function assertUploadableImage(file: File, maxBytes = MAX_AVATAR_BYTES): Promise<void> {
  await readValidatedUpload(file, { maxBytes, allowed: ALLOWED_IMAGE_TYPES });
}

/** Refuse an oversized bulk-import workbook before ExcelJS tries to parse it. */
export function assertSpreadsheetSize(file: File, maxBytes = MAX_SPREADSHEET_BYTES): void {
  if (file.size > maxBytes) {
    throw new UploadRejectedError(
      `That workbook is ${mb(file.size)}. The limit is ${mb(maxBytes)} — split the import into smaller files.`,
    );
  }
}

// ---------------------------------------------------------------------------
// The other direction: spreadsheet formula injection on EXPORT.
// ---------------------------------------------------------------------------
// A cell whose text begins with = + - @ (or a leading tab/CR) is executed as a
// formula when the exported file is opened in Excel or Sheets — on the
// RECIPIENT's machine, with their permissions. Every export in this app carries
// free text somebody typed in (skill names, course titles, notes), so every
// exported cell goes through this. The import side has its own stripper in
// `BulkUpload.tsx`; this is the mirror.
const FORMULA_START = /^[=+\-@\t\r]/;

/** Make one exported cell inert. Non-strings pass through untouched. */
export function safeExportCell<T>(value: T): T | string {
  if (typeof value !== 'string') return value;
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** `safeExportCell` over a whole row — what `ws.addRow(...)` should be given. */
export function safeExportRow(values: unknown[]): unknown[] {
  return values.map(safeExportCell);
}
