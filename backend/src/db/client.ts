import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { config } from "../config.js";
import * as schema from "./schema.js";

export function openDatabase(): Database.Database {
  const dir = path.dirname(config.DATABASE_PATH);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(config.DATABASE_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const sqlite = openDatabase();

export const db = drizzle(sqlite, { schema });

export { sqlite };
