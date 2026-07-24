# Personalization Addendum — company + persona VARIANT

`SKILL.md` in this folder is Eric's copywriting skill, kept as-is. **Eric's rules and subject-line
guidance always apply.** This addendum adds ONE more option: a **company + persona personalization
variant** you can layer on top. It does not replace anything.

## Eric's rules still govern (unchanged)
Short (50–90 words) · no em dashes · one job per email · `{{company_name}}` not `{{company}}` ·
low-effort binary CTA · no "curious"/"quick question" · **subject line = 2–3 words** (the email's context,
4 max), lowercase for personalized subjects · front-load the compelling phrase.

## The company + persona variant (what it adds)
| Layer | What | Note |
|---|---|---|
| Merge tags | `{{first_name}}`, `{{company_name}}` | baseline, always present |
| **Company-level (AI)** | opening line from real FireCrawl research on that prospect (`{{ai_company_context}}`) | the variant's core |
| **Persona-level** | offer/angle matched to the decision-maker's role | pin the target title BEFORE finding contacts |

**Use it especially for broad/lookalike lists**, where merge tags alone feel generic. For tightly-filtered
niche lists, Eric's standard copy may be enough on its own — this variant is optional there.

## How to apply the variant
1. Pin the persona (target title) so the whole list is one primary role.
2. `firecrawl-enrich` + `personalization-subagent-pattern` → `{{ai_company_context}}` per prospect.
3. Write with `campaign-copywriting` (Eric's rules), using that line + a persona-matched angle.
4. Keep the subject 2–3 words.

## Reference example
`profiles/aforanalytic/campaigns/company-persona-variant.md` — 2 finished samples (recycler-ops owner and
agency owner) with 2–3 word subjects.
