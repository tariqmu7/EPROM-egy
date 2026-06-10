#!/usr/bin/env node
// Validates that all required VITE_FIREBASE_* env vars are set before building.
// Run via: node scripts/check-env.mjs
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

const missing = REQUIRED.filter(key => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error('❌ Build blocked — missing required environment variables:');
  missing.forEach(key => console.error(`   ${key}`));
  console.error('\nSet them in .env.production (local) or as CI/CD secrets.');
  process.exit(1);
}

console.log('✅ All required Firebase env vars are present.');
