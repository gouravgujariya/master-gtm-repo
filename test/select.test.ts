import { test } from "node:test";
import assert from "node:assert/strict";
import { selectContacts } from "../src/core/select.ts";

test("selectContacts ranks by title+seniority, prefers business email, skips no-email companies", () => {
  const records = [
    { first_name: "M", job_title: "Marketing Manager", primary_email: "m@a.com", company_domain: "a.com" },
    { first_name: "F", job_title: "Founder & CEO", primary_email: "f@a.com", company_domain: "a.com" },
    { first_name: "V", job_title: "VP Sales", primary_email: null, personal_emails: '["v@gmail.com"]', company_domain: "b.com" },
    { first_name: "N", job_title: "CEO", primary_email: null, company_domain: "c.com" },
  ];
  const r = selectContacts(records, { titles: "VP Sales,Founder" });
  assert.equal(r.companies, 3);
  assert.equal(r.skippedNoEmail, 2); // b.com (personal not allowed) + c.com
  assert.deepEqual(r.contacts.map((c) => [c.email, c.email_kind, c.find_source]), [["f@a.com", "business", "agenticdata"]]);

  const p = selectContacts(records, { titles: "VP Sales,Founder", perCompany: 2, allowPersonal: true });
  assert.deepEqual(p.contacts.map((c) => c.email), ["f@a.com", "m@a.com", "v@gmail.com"]);
  assert.equal(p.contacts[2].email_kind, "personal");
});
