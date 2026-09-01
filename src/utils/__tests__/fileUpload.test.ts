// Upload safety (task 5). The browser half of the rule the server enforces in
// `server/src/collections/schemas.ts`: the type of a picked file is decided by
// its BYTES, never by its name, and nothing oversized is read at all.
import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  readValidatedUpload,
  safeFileName,
  safeExportCell,
  safeExportRow,
  UploadRejectedError,
  MAX_ATTACHMENT_BYTES,
  ALLOWED_IMAGE_TYPES,
} from '../fileUpload';

const bytes = (...values: number[]) => new Uint8Array(values);
const asciiBytes = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)));

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0);
const PDF = asciiBytes('%PDF-1.4\n%âã');
const WEBP = new Uint8Array([...asciiBytes('RIFF'), 0, 0, 0, 0, ...asciiBytes('WEBP')]);
const HTML = asciiBytes('<html><script>alert(1)</script>');

const fileOf = (data: Uint8Array, name: string, type = 'application/octet-stream') =>
  new File([data as unknown as BlobPart], name, { type });

describe('detectFileType', () => {
  it('reads the real type out of the bytes', () => {
    expect(detectFileType(PNG)).toBe('image/png');
    expect(detectFileType(JPEG)).toBe('image/jpeg');
    expect(detectFileType(PDF)).toBe('application/pdf');
    expect(detectFileType(WEBP)).toBe('image/webp');
  });

  it('returns null for anything not on the allowlist', () => {
    expect(detectFileType(HTML)).toBeNull();
    expect(detectFileType(asciiBytes('<svg onload=alert(1)>'))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });
});

describe('readValidatedUpload', () => {
  it('accepts a real PDF and returns a data URL of the DETECTED type', async () => {
    const result = await readValidatedUpload(fileOf(PDF, 'cert.pdf', 'application/pdf'));
    expect(result.mime).toBe('application/pdf');
    expect(result.dataUrl.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('ATTACK: refuses an HTML file renamed to .pdf, whatever the browser claims', async () => {
    await expect(readValidatedUpload(fileOf(HTML, 'cert.pdf', 'application/pdf')))
      .rejects.toBeInstanceOf(UploadRejectedError);
  });

  it('labels the file by its bytes, not its extension', async () => {
    // A genuine PNG saved as ".pdf" is still stored as an image, so the viewer
    // that switches on `data:image` cannot be fooled either way.
    const result = await readValidatedUpload(fileOf(PNG, 'scan.pdf'));
    expect(result.mime).toBe('image/png');
  });

  it('refuses an oversized file BEFORE reading it', async () => {
    const big = fileOf(PNG, 'huge.png');
    Object.defineProperty(big, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    await expect(readValidatedUpload(big)).rejects.toThrow(/limit is/);
  });

  it('refuses an empty file', async () => {
    await expect(readValidatedUpload(fileOf(new Uint8Array(), 'empty.pdf'))).rejects.toThrow(/empty/);
  });

  it('honours a narrower allowlist (avatars take no PDF)', async () => {
    await expect(readValidatedUpload(fileOf(PDF, 'cv.pdf'), { allowed: ALLOWED_IMAGE_TYPES }))
      .rejects.toBeInstanceOf(UploadRejectedError);
  });
});

describe('safeFileName', () => {
  it('keeps the base name only — no directories, no leading dots', () => {
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('C:\\Users\\me\\report.pdf')).toBe('report.pdf');
    expect(safeFileName('.hidden.pdf')).toBe('hidden.pdf');
  });

  it('bounds the length and falls back when nothing is left', () => {
    expect(safeFileName(`${'a'.repeat(300)}.pdf`).length).toBe(120);
    expect(safeFileName('...')).toBe('attachment');
  });
});

describe('safeExportCell — formula injection on the way OUT', () => {
  it('neutralises a cell that Excel would execute', () => {
    expect(safeExportCell('=cmd|/c calc')).toBe("'=cmd|/c calc");
    expect(safeExportCell('+1+1')).toBe("'+1+1");
    expect(safeExportCell('-2+3')).toBe("'-2+3");
    expect(safeExportCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('leaves ordinary values untouched', () => {
    expect(safeExportCell('Welding Inspection')).toBe('Welding Inspection');
    expect(safeExportCell(42)).toBe(42);
    expect(safeExportCell(null)).toBe(null);
    expect(safeExportRow(['Skill', '=HYPERLINK("x")', 3])).toEqual(['Skill', "'=HYPERLINK(\"x\")", 3]);
  });
});
