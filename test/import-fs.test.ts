import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contextMeta, profileFromYaml, companyFromRow, contactFromRow, csvKind, mergeBy, approvalStages, fileKind,
} from "../scripts/import-fs.ts";

test("contextMeta parses name + stage like listClients", () => {
  const t = "# Acme Co — context\n\n- Current stage: copy   # ICP / strategy\n";
  assert.deepEqual(contextMeta(t, "acme"), { name: "Acme Co", stage: "copy" });
  assert.deepEqual(contextMeta("no header", "acme"), { name: "acme", stage: "" });
});

test("profileFromYaml splits sections", () => {
  const p = profileFromYaml({ client: { website: "https://a.com" }, icp: { titles: ["CEO"] }, infrastructure_status: { has_inboxes: true } });
  assert.equal(p.website, "https://a.com");
  assert.deepEqual(p.icp, { titles: ["CEO"] });
  assert.deepEqual(p.infrastructureStatus, { has_inboxes: true });
  assert.equal(p.offer, null);
});

test("companyFromRow maps varied columns, lowercases domain, extras → raw", () => {
  const c = companyFromRow({ name: "Acme", normalized_display_link: "Acme.COM", employees: "50", foo: "bar", id: 7, client: "x" });
  assert.equal(c.companyName, "Acme");
  assert.equal(c.domain, "acme.com");
  assert.equal(c.companySize, "50");
  assert.deepEqual(c.raw, { foo: "bar" });
});

test("contactFromRow lowercases email, parses sendable, keeps old Supabase-only columns in raw", () => {
  const c = contactFromRow({ email: " Jo@Acme.com ", sendable: "yes", list_source: "bulk-saas", subject_1: "hi" });
  assert.equal(c.email, "jo@acme.com");
  assert.equal(c.sendable, true);
  assert.deepEqual(c.raw, { list_source: "bulk-saas", subject_1: "hi" });
  assert.equal(contactFromRow({ email: "a@b.c" }).sendable, undefined);
});

test("csvKind + mergeBy (later non-empty wins, raw merged)", () => {
  assert.equal(csvKind([{ email: "a" }]), "contacts");
  assert.equal(csvKind([{ domain: "a" }]), "companies");
  assert.equal(csvKind([{ x: "a" }]), null);
  const m = mergeBy<any>([
    { email: "a", title: "CEO", sendable: undefined, raw: { x: 1 } },
    { email: "a", title: "", sendable: true, raw: { y: 2 } },
    { email: null, title: "drop" },
  ], (r) => r.email);
  assert.deepEqual(m, [{ email: "a", title: "CEO", sendable: true, raw: { x: 1, y: 2 } }]);
});

test("approvalStages maps wizard steps, dedupes, skips inputs/false", () => {
  assert.deepEqual(approvalStages({ approved: { 0: true, 1: true, 4: true, 5: true, 6: false } }), ["icp", "contacts"]);
  assert.deepEqual(approvalStages(null), []);
});

test("fileKind", () => {
  assert.equal(fileKind("inputs/questionnaire.md"), "questionnaire");
  assert.equal(fileKind("inputs/call-transcript-1.txt"), "transcript");
  assert.equal(fileKind("inputs/deck.pdf"), "upload");
  assert.equal(fileKind("research/site.md"), "research");
});
