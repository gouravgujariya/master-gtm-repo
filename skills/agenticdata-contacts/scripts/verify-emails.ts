/**
 * verify-emails.ts — OptimaVerifier email verification (PRIMARY gate). Thin CLI over
 * src/providers/optimaverifier.ts + src/core/verify.ts.
 *
 * Every email must pass through here before a campaign upload. Gate:
 *   valid     -> sendable
 *   invalid   -> dropped
 *   catch-all -> NOT sendable yet; flagged for cross-check vs a 2nd verifier (default: AgenticData)
 *   unknown   -> held (do not send yet)
 *
 * Usage:
 *   npm run check-credits
 *   npm run verify-emails -- --email=someone@company.com          # single smoke test (1 credit)
 *   npm run verify-emails -- --in=contacts.csv --out=verified.csv # bulk verify a CSV
 *   optional: --email-col=email  --job=my-job-name
 *
 * Docs: references/optimaverifier-api.md  (base https://app.optimaverifier.com/api/v1, Bearer auth)
 */
import { writeFileSync, readFileSync } from "node:fs";
import { args, parseCsv, toCsv } from "../../../lib/env.ts";
import { upsert, slug, editorUrl, TableMissingError, explainMissing } from "../../../lib/supabase.ts";
import { cliCtx, runCli } from "../../../src/core/ctx.ts";
import { getCredits, verifySingle } from "../../../src/providers/optimaverifier.ts";
import { gate, normStatus, verifyRows } from "../../../src/core/verify.ts";

runCli(async () => {
  const ctx = cliCtx();
  const a = args();

  if (a.credits) {
    const c = await getCredits(ctx);
    console.log("Credit balance:", c.balance ?? c.credits ?? JSON.stringify(c));
    return;
  }
  if (typeof a.email === "string") {
    const { status, raw } = await verifySingle(ctx, a.email);
    const g = gate(status);
    console.log(`${a.email} -> ${status}  (${g.sendable ? "SENDABLE" : g.note})`);
    if (raw.credits_remaining != null) console.log("credits_remaining:", raw.credits_remaining);
    return;
  }

  const inPath = a.in as string;
  const outPath = a.out as string;
  if (!inPath || !outPath) {
    console.error("Usage: --in=contacts.csv --out=verified.csv [--email-col=email] [--job=name]  |  --email=a@b.com  |  --credits");
    process.exit(1);
  }
  const emailCol = (a["email-col"] as string) || "email";
  const jobName = (a.job as string) || `krishna-gtm-${inPath.split("/").pop()}`.slice(0, 255);

  const rows = parseCsv(readFileSync(inPath, "utf8"));
  if (!rows.some((r) => (r[emailCol] || "").trim())) { console.error(`No emails found in column "${emailCol}".`); process.exit(1); }

  const out = await verifyRows(ctx, rows, {
    emailCol,
    jobName,
    onProgress: (status, pct) => process.stdout.write(`\r  status=${status} ${pct !== "" ? pct + "%" : ""}   `),
  });
  console.log("");

  const kept = out.filter((r) => r.sendable === "yes").length;
  const counts = out.reduce((m: Record<string, number>, r) => ((m[r.email_status] = (m[r.email_status] || 0) + 1), m), {});
  writeFileSync(outPath, toCsv(out));
  console.log(`\nDone. ${kept}/${out.length} sendable. Status counts:`, counts);
  console.log(`Wrote ${outPath}`);
  const catchAll = out.filter((r) => normStatus(r.email_status) === "catch-all").length;
  if (catchAll) console.log(`Note: ${catchAll} catch-all rows need a 2nd-verifier cross-check (AI Ark) before sending.`);

  // Optional: persist straight to Supabase (contacts table), tagged with client/segment/source.
  if (a.push) {
    const client = slug(String(a.client || ""));
    if (!client) { console.error('\n--push needs --client="..." (and optionally --segment --market --size --source).'); process.exit(1); }
    const tag = {
      client,
      segment: slug(String(a.segment || "")) || null,
      target_market: slug(String(a.market || "")) || null,
      company_size: slug(String(a.size || "")) || null,
      list_source: slug(String(a.source || "")) || null,
    };
    let recs = out.map((r: Record<string, string>) => ({
      ...tag,
      email: (r[emailCol] || "").toLowerCase().trim(),
      first_name: r.first_name || null, last_name: r.last_name || null,
      company_name: r.company_name || null, company_domain: r.company_domain || null,
      title: r.title || null, linkedin_url: r.linkedin_url || null,
      email_status: r.email_status || null, sendable: r.sendable === "yes",
      find_source: r.find_source || null, verify_note: r.verify_note || null,
    })).filter((r) => r.email);
    if (a["only-sendable"]) recs = recs.filter((r) => r.sendable);
    try {
      const n = await upsert("contacts", recs, "client,email");
      console.log(`\n✓ Pushed ${n} contacts to Supabase (client "${client}"). Preview: ${editorUrl()}`);
    } catch (e) {
      if (e instanceof TableMissingError) explainMissing("contacts", "supabase/schema-contacts.sql");
      else console.error("\nPush failed:", (e as Error).message);
    }
  }
});
