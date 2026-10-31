import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keysCtx } from "../src/core/ctx.ts";
import { AppError } from "../src/core/errors.ts";
import { assertPaidAllowed, sourceCompanies } from "../src/core/source.ts";

const ctx = keysCtx({});

test("paid source rejected without allowPaid + reason", async () => {
  assert.throws(() => assertPaidAllowed({}), AppError);
  assert.throws(() => assertPaidAllowed({ allowPaid: true }), AppError);
  assert.throws(() => assertPaidAllowed({ allowPaid: true, reason: "  " }), AppError);
  assert.throws(() => assertPaidAllowed({ reason: "bulk empty" }), AppError);
  let ran = false;
  const paid = async () => { ran = true; return []; };
  await assert.rejects(sourceCompanies(ctx, { dataset: "saas", paid }), AppError);
  assert.equal(ran, false);
  await sourceCompanies(ctx, { dataset: "saas", paid, allowPaid: true, reason: "bulk returned 0" });
  assert.equal(ran, true);
});

test("bulk filters work on fixtures (saas + local)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bulk-"));
  writeFileSync(join(dir, "us-software-saas-companies-cleaned.csv"),
    'Company Name,Domain,Industry,Employee Size Range,Locality,Country,LinkedIn Company URL\n' +
    'Acme,acme.com,Marketing,11-50,"Austin, TX",United States,\n' +
    'Beta,beta.io,Finance,11-50,London,United Kingdom,\n' +
    'Gamma,gamma.com,marketing services,51-200,Paris,France,\n');
  const saas = await sourceCompanies(ctx, { dataset: "saas", dir, filters: { industry: "MARKETING", location: "united states" }, limit: 5 });
  assert.deepEqual(saas.map((r) => r.domain), ["acme.com"]);
  assert.equal(saas[0].source, "bulk-saas");

  const gm = join(dir, "Google Maps Scrape - 12M US Businesses");
  mkdirSync(gm);
  writeFileSync(join(dir, "us-zip-codes.csv"), "zip,state\n90001,CA\n10001,NY\n");
  writeFileSync(join(gm, "part1.csv"),
    "title,link,phone,category_titles,zip_code\nSmile,smile.com,555.0,Dentist,90001.0\nNYDent,ny.com,1,Dentist,10001\nPizza,p.com,2,Restaurant,90001\n");
  const local = await sourceCompanies(ctx, { dataset: "local", dir, filters: { category: "dentist", state: "ca" } });
  assert.deepEqual(local, [{ company_name: "Smile", domain: "smile.com", phone: "555", category: "Dentist", zip: "90001", source: "bulk-local" }]);
});
