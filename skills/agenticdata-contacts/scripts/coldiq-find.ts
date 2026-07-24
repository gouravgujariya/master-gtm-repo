/**
 * coldiq-find.ts — LAST-RESORT work-email finder (ColdIQ waterfall, 40+ providers).
 * Use ONLY after AgenticData + AI Ark both failed. Input = a LinkedIn URL per contact.
 *
 * Usage:
 *   npm run coldiq -- --credits
 *   npm run coldiq -- --linkedin=https://linkedin.com/in/xxxx           # single lookup
 *   npm run coldiq -- --in=missing.csv --out=found.csv [--linkedin-col=linkedin_url]
 *
 * Docs: references/coldiq-api.md  (POST /gtm-verbs/find-work-email {person_linkedin_url}; GET /credits)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { requireKey, args, parseCsv, toCsv, sleep } from "../../../lib/env.js";

const BASE = "https://api.coldiq.com";
const KEY = requireKey("COLDIQ_API_KEY");

async function ciq(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`ColdIQ ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

function normalizeLinkedIn(url: string): string {
  const u = url.trim();
  return u.startsWith("http") ? u : `https://${u}`;
}

/** Returns the found work email (or null). Uses ColdIQ's LimaData provider (LinkedIn -> work email). */
async function findWorkEmail(linkedin: string): Promise<string | null> {
  const r = await ciq("/v1/limadata/find/work-email-linkedin", {
    method: "POST",
    body: JSON.stringify({ linkedin_url: normalizeLinkedIn(linkedin) }),
  });
  // LimaDataResponse is untyped/nullable — try common shapes
  return r?.email ?? r?.work_email ?? r?.data?.email ?? r?.result?.email ?? (typeof r === "string" ? r : null);
}

/** Fallback finder by name + company domain (when no LinkedIn URL is available). */
async function findWorkEmailByName(fullName: string, domain: string): Promise<string | null> {
  const r = await ciq("/v1/limadata/find/work-email", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName, company_domain: domain }),
  });
  return r?.email ?? r?.work_email ?? r?.data?.email ?? r?.result?.email ?? (typeof r === "string" ? r : null);
}

async function main() {
  const a = args();

  if (a.credits) {
    const c = await ciq("/v1/me/credits");
    console.log("ColdIQ credits:", c.balance ?? JSON.stringify(c), c.usedThisMonth != null ? `(used this month: ${c.usedThisMonth})` : "");
    return;
  }

  if (typeof a.linkedin === "string") {
    const email = await findWorkEmail(a.linkedin);
    console.log(email ? `Found: ${email}` : "No email found.");
    return;
  }

  const inPath = a.in as string, outPath = a.out as string;
  if (!inPath || !outPath) {
    console.error("Usage: --credits | --linkedin=<url> | --in=missing.csv --out=found.csv [--linkedin-col=linkedin_url]");
    process.exit(1);
  }
  const col = (a["linkedin-col"] as string) || "linkedin_url";
  const rows = parseCsv(readFileSync(inPath, "utf8"));

  const out: Record<string, string>[] = [];
  let found = 0;
  for (const r of rows) {
    const li = (r[col] || "").trim();
    if (!li) { out.push({ ...r, coldiq_email: "", coldiq_note: "no linkedin url" }); continue; }
    try {
      const email = await findWorkEmail(li);
      if (email) found++;
      out.push({ ...r, coldiq_email: email || "", coldiq_note: email ? "found" : "not found" });
    } catch (e: any) {
      out.push({ ...r, coldiq_email: "", coldiq_note: `error: ${e.message?.slice(0, 80)}` });
    }
    await sleep(400); // be polite
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`ColdIQ: found ${found}/${rows.length}. Wrote ${outPath}. (Verify any new emails with OptimaVerifier.)`);
}

main().catch((e) => { console.error("\n" + (e?.message || e)); process.exit(1); });
