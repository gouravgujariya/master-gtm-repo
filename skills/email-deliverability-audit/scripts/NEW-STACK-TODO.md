# Rebuild TODO — email-deliverability-audit scripts

Copied from Eric's repo. Status per file:

| File | Status |
|---|---|
| `check-domain-auth.ts` | **KEEP AS-IS** — pure `dig` SPF/DKIM/DMARC check, vendor-neutral. |
| `audit-inboxes.ts` | Legacy Smartlead. Rebuild against **Inboxkit/Maildoso** (inbox inventory + health) and the sending platform. |
| `audit-performance.ts` | Legacy Smartlead. Rebuild against **Plusvibe** (default) / **Smartlead** analytics. |
| `run-spam-test.ts` | Legacy Smartlead Smart Delivery. Rebuild against the sending platform's placement test, or a standalone seed-list test. |

## Core rule to preserve (platform-neutral)
The **1% rule** — a healthy domain has ≥1% reply rate after 200 sends. Below that after 200+ sends is
a red flag. Keep this threshold and the root-cause suggestions in `SKILL.md` regardless of platform.

References: `references/plusvibe-api.md`, `references/inboxkit-api.md`, `references/maildoso-api.md`,
`references/smartlead-api.md`.
