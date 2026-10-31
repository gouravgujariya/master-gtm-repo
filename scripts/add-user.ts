// Create (or reset the password of) a team user. No signup endpoint by design.
// npm run user:add -- --email=x@y.com --password=secret [--role=admin]
import { parseArgs } from "node:util";
import { db, pool } from "../src/db/client.ts";
import { users } from "../src/db/schema.ts";
import { hashPassword } from "../src/api/auth.ts";

const { values: a } = parseArgs({ options: { email: { type: "string" }, password: { type: "string" }, role: { type: "string", default: "operator" } } });
if (!a.email || !a.password || !["admin", "operator"].includes(a.role!)) {
  console.error("usage: npm run user:add -- --email=x --password=y [--role=admin|operator]");
  process.exit(1);
}
const passHash = await hashPassword(a.password);
const [u] = await db.insert(users).values({ email: a.email.toLowerCase(), passHash, role: a.role })
  .onConflictDoUpdate({ target: users.email, set: { passHash, role: a.role, disabledAt: null } })
  .returning({ id: users.id, email: users.email, role: users.role });
console.log(`user ${u.email} (${u.role}) ready — id ${u.id}`);
await pool.end();
