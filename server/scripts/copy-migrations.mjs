// Copies the .sql migration files into dist so `node dist/index.js` (production)
// can find them alongside the compiled migrate.js. Dev/tsx reads src directly.
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist/migrations', { recursive: true });
cpSync('src/migrations', 'dist/migrations', { recursive: true });
console.log('copied migrations -> dist/migrations');
