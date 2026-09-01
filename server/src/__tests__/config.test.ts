import { describe, it, expect } from 'vitest';
import { assertStrongSecret, looksLikePlaceholder } from '../config.js';

// JWT_SECRET is the password to every account at once: hold it and you can mint
// a token for any user id with role ADMIN, and every check in authz.ts sits
// downstream of "the signature is valid". The shipped example value is 33
// characters long, so a length rule alone would have let it through — these
// tests pin that the marker rule is what actually catches it.
describe('production secrets must not be the shipped placeholders', () => {
  it('refuses the exact value in .env.docker.example', () => {
    expect(() => assertStrongSecret('JWT_SECRET', 'change-me-to-a-long-random-string')).toThrow(
      /looks like the example value/i,
    );
  });

  it('refuses the exact PGPASSWORD in .env.docker.example', () => {
    expect(() => assertStrongSecret('PGPASSWORD', 'change-me-strong', 16)).toThrow(/looks like the example value/i);
  });

  it('refuses a short secret and names the length', () => {
    expect(() => assertStrongSecret('JWT_SECRET', 'a1b2c3d4')).toThrow(/too short for production \(8 chars/);
  });

  it('accepts a real generated secret', () => {
    const generated = 'f3a9c1d0e27b45886ac0f1b3d94e6270a5c8fb12d7e04936aa1c58e7d2b04f61';
    expect(assertStrongSecret('JWT_SECRET', generated)).toBe(generated);
  });

  it('flags placeholder wording wherever it appears in the value', () => {
    for (const v of ['CHANGE-ME', 'my-placeholder-key', 'example-value-here', 'super-secret-key']) {
      expect(looksLikePlaceholder(v)).toBe(true);
    }
    // A hex secret can never contain those markers — hex has no s, o, p, r, w.
    expect(looksLikePlaceholder('f3a9c1d0e27b45886ac0f1b3d94e6270')).toBe(false);
  });
});
