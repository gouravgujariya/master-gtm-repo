import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "../config.ts";
import * as schema from "./schema.ts";

export const pool = new pg.Pool({ connectionString: config().DATABASE_URL });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
