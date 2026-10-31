// Apply pending SQL migrations from src/db/migrations, then close the pool.
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.ts";

try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  console.log("✓ migrations applied");
} finally {
  await pool.end();
}
