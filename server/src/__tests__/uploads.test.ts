// ============================================================================
// Stored-file validation (task 5 — upload security).
//
// ECMS keeps every attachment INSIDE the document as a `data:` URL, so the
// browser's magic-byte check is a courtesy, not a control — a scripted caller
// posts straight to `/col`. `validateDoc` runs on every create/set/update and
// every `/batch` op, so this is where the type allowlist has to hold.
//
// Each "attack" below is what a plain employee account could send today.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { validateDoc } from '../collections/schemas.js';

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('stored files: only allowlisted types may be saved', () => {
  it('accepts a real PNG data URL as evidence', () => {
    expect(validateDoc('evidences', { userId: 'u1', fileUrl: PNG_1PX }).ok).toBe(true);
  });

  it('accepts a PDF and an empty field', () => {
    expect(validateDoc('evidences', { fileUrl: 'data:application/pdf;base64,JVBERi0xLjQK' }).ok).toBe(true);
    expect(validateDoc('evidences', { fileUrl: '' }).ok).toBe(true);
  });

  it('ATTACK: refuses an HTML payload dressed as an attachment', () => {
    const res = validateDoc('evidences', {
      userId: 'u1',
      fileUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not allowed/);
  });

  it('ATTACK: refuses a javascript: URL', () => {
    expect(validateDoc('evidences', { fileUrl: 'javascript:alert(1)' }).ok).toBe(false);
  });

  it('ATTACK: refuses an SVG attachment — it can carry script', () => {
    expect(validateDoc('evidences', { fileUrl: 'data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E' }).ok).toBe(false);
  });

  it('ATTACK: refuses a payload past the size cap', () => {
    const huge = `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`;
    const res = validateDoc('evidences', { fileUrl: huge });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/too large/);
  });

  it('still accepts a legacy https link (Firebase-era records)', () => {
    expect(validateDoc('evidences', { fileUrl: 'https://files.example.com/a.pdf' }).ok).toBe(true);
  });

  it('bounds the display filename', () => {
    expect(validateDoc('evidences', { fileName: 'scan.pdf' }).ok).toBe(true);
    expect(validateDoc('evidences', { fileName: 'x'.repeat(500) }).ok).toBe(false);
  });
});

describe('avatars: SVG allowed (generated, <img>-only), scripts still not', () => {
  it('accepts the generated percent-encoded initials avatar', () => {
    const generated = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E';
    expect(validateDoc('users', { name: 'A', avatarUrl: generated }).ok).toBe(true);
  });

  it('accepts the WebP the avatar uploader re-encodes to', () => {
    expect(validateDoc('users', { avatarUrl: 'data:image/webp;base64,UklGRg==' }).ok).toBe(true);
  });

  it('ATTACK: refuses text/html and javascript: as an avatar', () => {
    expect(validateDoc('users', { avatarUrl: 'data:text/html;base64,PHA+' }).ok).toBe(false);
    expect(validateDoc('users', { avatarUrl: 'javascript:alert(1)' }).ok).toBe(false);
  });
});

describe('certificates: the rule reaches through the JSON string', () => {
  // preparePayload JSON.stringify()s users.certificates, so on the wire it is a
  // STRING. Validating only `avatarUrl` would leave the certificate scan — the
  // other file an employee can store on their own user document — unchecked.
  it('accepts a certificate carrying a PNG', () => {
    const certs = JSON.stringify([{ id: 'c1', name: 'IOSH', fileUrl: PNG_1PX }]);
    expect(validateDoc('users', { certificates: certs }).ok).toBe(true);
  });

  it('ATTACK: refuses a certificate carrying an HTML payload', () => {
    const certs = JSON.stringify([{ id: 'c1', name: 'IOSH', fileUrl: 'data:text/html;base64,PHA+' }]);
    const res = validateDoc('users', { certificates: certs });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/certificate 1/);
  });

  it('leaves a certificate with no file, and an unparseable value, alone', () => {
    expect(validateDoc('users', { certificates: JSON.stringify([{ id: 'c1', name: 'IOSH' }]) }).ok).toBe(true);
    expect(validateDoc('users', { certificates: 'not json at all' }).ok).toBe(true);
    expect(validateDoc('users', { certificates: '' }).ok).toBe(true);
  });
});
