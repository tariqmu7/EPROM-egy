#!/usr/bin/env node
/**
 * Generates firestore.rules from firestore.rules.template by substituting
 * the bootstrap admin email from the VITE_BOOTSTRAP_ADMIN_EMAIL env var.
 *
 * Firestore security rules cannot read environment variables at runtime,
 * so the value must be baked in at build/deploy time. Run this before
 * `firebase deploy --only firestore:rules`:
 *
 *   npm run rules:build
 *
 * Resolution order for VITE_BOOTSTRAP_ADMIN_EMAIL:
 *   1. process.env (CI / shell)
 *   2. .env.production   3. .env.local   4. .env
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'firestore.rules.template');
const OUTPUT = join(ROOT, 'firestore.rules');
const KEY = 'VITE_BOOTSTRAP_ADMIN_EMAIL';
const PLACEHOLDER = '__BOOTSTRAP_ADMIN_EMAIL__';

function fail(msg) {
  console.error(`\n[gen-firestore-rules] ERROR: ${msg}\n`);
  process.exit(1);
}

/** Minimal .env parser — no dependency on dotenv. */
function readEnvFile(file) {
  if (!existsSync(file)) return undefined;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    if (line.slice(0, eq).trim() !== KEY) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

function resolveEmail() {
  if (process.env[KEY] && process.env[KEY].trim()) return process.env[KEY];
  for (const f of ['.env.production', '.env.local', '.env']) {
    const v = readEnvFile(join(ROOT, f));
    if (v !== undefined && v.trim()) return v;
  }
  return undefined;
}

if (!existsSync(TEMPLATE)) fail(`template not found: ${TEMPLATE}`);

const raw = resolveEmail();
if (!raw) {
  fail(
    `${KEY} is not set. Define it in the environment or in ` +
      `.env.production / .env.local before generating Firestore rules.`
  );
}

const email = raw.trim().toLowerCase();

// Guard against breaking the generated rules string or injecting clauses.
if (!/^[^\s"'\\@]+@[^\s"'\\@]+\.[^\s"'\\@]+$/.test(email)) {
  fail(`${KEY} value "${raw}" is not a valid email address.`);
}

const template = readFileSync(TEMPLATE, 'utf8');
if (!template.includes(PLACEHOLDER)) {
  fail(`placeholder ${PLACEHOLDER} not found in firestore.rules.template`);
}

const output = template.split(PLACEHOLDER).join(email);
writeFileSync(OUTPUT, output);

console.log(
  `[gen-firestore-rules] Wrote firestore.rules with bootstrap admin: ${email}`
);
