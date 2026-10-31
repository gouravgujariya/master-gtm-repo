// Auth: scrypt passwords, DB sessions, httpOnly `sid` cookie. No signup (scripts/add-user.ts).
// Also holds the tiny shared route helpers (parse/need) so routers import one module.
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { AppError } from "../core/errors.ts";
import { config } from "../config.ts";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client.ts";
import { sessions, users } from "../db/schema.ts";

export interface User { id: string; email: string; role: string }
export type Env = { Variables: { user: User } };
export type SessionLookup = (sid: string) => Promise<User | null>;

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const SESSION_MS = 14 * 24 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `salt:hash` hex, as stored in users.pass_hash. */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scryptAsync(pw, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, "hex");
  const got = await scryptAsync(pw, Buffer.from(salt, "hex"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Validate a value with zod → AppError 400. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, "VALIDATION", r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}
export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  return parse(schema, await c.req.json().catch(() => undefined));
}
export function uuidParam(c: Context, name: string): string {
  const v = c.req.param(name);
  if (!v || !UUID.test(v)) throw new AppError(404, "NOT_FOUND", `Bad ${name}`);
  return v;
}
export function need<T>(row: T | undefined | null, what: string): T {
  if (!row) throw new AppError(404, "NOT_FOUND", `${what} not found`);
  return row;
}

export const dbSessionUser: SessionLookup = async (sid) => {
  const [u] = await db.select({ id: users.id, email: users.email, role: users.role })
    .from(sessions).innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date()), isNull(users.disabledAt)));
  return u ?? null;
};

export function requireAuth(lookup: SessionLookup): MiddlewareHandler<Env> {
  return async (c, next) => {
    const sid = getCookie(c, "sid");
    const user = sid && UUID.test(sid) ? await lookup(sid) : null; // no cookie → reject before any DB call
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Login required");
    c.set("user", user);
    await next();
  };
}

function cookieOpts() {
  const prod = config().NODE_ENV === "production"; // UI may live on another domain in prod
  return { httpOnly: true, path: "/", sameSite: prod ? "None" : "Lax", secure: prod, maxAge: SESSION_MS / 1000 } as const;
}

const Login = z.object({ email: z.string().email(), password: z.string().min(1) });
let dummyHash: Promise<string> | undefined;

export function authRoutes(lookup: SessionLookup) {
  return new Hono<Env>()
    .post("/login", async (c) => {
      const { email, password } = await body(c, Login);
      const [u] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
      // hash anyway when the user is missing so timing doesn't reveal which emails exist
      const ok = await verifyPassword(password, u?.passHash ?? await (dummyHash ??= hashPassword("x")));
      if (!u || !ok || u.disabledAt) throw new AppError(401, "BAD_LOGIN", "Wrong email or password");
      const [s] = await db.insert(sessions).values({ userId: u.id, expiresAt: new Date(Date.now() + SESSION_MS) }).returning();
      setCookie(c, "sid", s.id, cookieOpts());
      return c.json({ user: { id: u.id, email: u.email, role: u.role } });
    })
    .post("/logout", async (c) => {
      const sid = getCookie(c, "sid");
      if (sid && UUID.test(sid)) {
        await db.delete(sessions).where(eq(sessions.id, sid));
      }
      deleteCookie(c, "sid", cookieOpts());
      return c.json({ ok: true });
    })
    .get("/me", requireAuth(lookup), (c) => c.json({ user: c.get("user"), demoMode: config().DEMO_MODE }));
}
