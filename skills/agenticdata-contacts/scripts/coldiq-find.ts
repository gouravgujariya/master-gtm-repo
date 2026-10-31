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
 * Logic: src/providers/coldiq.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { args, parseCsv, toCsv, sleep } from "../../../lib/env.ts";
import { cliCtx, runCli } from "../../../src/core/ctx.ts";
import { ciq, findWorkEmail } from "../../../src/providers/coldiq.ts";

runCli(async () => {
  const ctx = cliCtx();
  ctx.getKey("COLDIQ_API_KEY"); // fail fast, like before
  const a = args();

  if (a.credits) {
    const c = await ciq(ctx, "/v1/me/credits");
    console.log("ColdIQ credits:", c.balance ?? JSON.stringify(c), c.usedThisMonth != null ? `(used this month: ${c.usedThisMonth})` : "");
    return;
  }

  if (typeof a.linkedin === "string") {
    const email = await findWorkEmail(ctx, a.linkedin);
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
      const email = await findWorkEmail(ctx, li);
      if (email) found++;
      out.push({ ...r, coldiq_email: email || "", coldiq_note: email ? "found" : "not found" });
    } catch (e: any) {
      out.push({ ...r, coldiq_email: "", coldiq_note: `error: ${e.message?.slice(0, 80)}` });
    }
    await sleep(400); // be polite
  }
  writeFileSync(outPath, toCsv(out));
  console.log(`ColdIQ: found ${found}/${rows.length}. Wrote ${outPath}. (Verify any new emails with OptimaVerifier.)`);
});
