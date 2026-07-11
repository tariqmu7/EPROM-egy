import './types.js'; // load Express Request augmentation
import { config } from './config.js';
import { createApp } from './app.js';
import { runMigrations } from './migrate.js';

async function main() {
  // Apply any pending migrations on boot so a fresh container is ready to serve.
  await runMigrations();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`EPROM CMS API listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error('failed to start server:', err);
  process.exit(1);
});
