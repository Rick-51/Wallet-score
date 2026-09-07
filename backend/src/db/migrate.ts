import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { config } from "../config.js";
import * as schema from "./schema.js";

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

export function runMigrations(): void {
  fs.mkdirSync(path.dirname(config.DATABASE_PATH), { recursive: true });
  const sqlite = new Database(config.DATABASE_PATH);
  try {
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder });
  } finally {
    sqlite.close();
  }
}

// Run directly when invoked via `npm run db:migrate`.
const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runMigrations();
  console.log("✓ Migrations applied.");
}
