import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { config } from "./config.js";
import { runMigrations } from "./db/migrate.js";
import { requeueUnfinished } from "./services/analyzer.js";

runMigrations();

// Re-enqueue any analysis requests that were interrupted by a restart.
void requeueUnfinished().then((n) => {
  if (n > 0) console.log(`Re-queued ${n} unfinished analysis request(s).`);
});

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`Credit Reputation API listening on http://localhost:${info.port}`);
});
