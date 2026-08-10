import './types.js'; // load Express Request augmentation
import { config } from './config.js';
import { createApp } from './app.js';
import { runMigrations } from './migrate.js';
import { startScheduler } from './jobs/scheduler.js';

async function main() {
  // Apply any pending migrations on boot so a fresh container is ready to serve.
  await runMigrations();

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`EPROM CMS API listening on :${config.port}`);
  });

  // Start the nightly sweep timer AFTER the listener, so a slow catch-up run
  // can never delay the API becoming healthy. Failures here are logged inside.
  await startScheduler();
}

main().catch((err) => {
  console.error('failed to start server:', err);
  process.exit(1);
});
