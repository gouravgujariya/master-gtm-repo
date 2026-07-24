# Krishna GTM Repo

A cold-outbound GTM system — Claude Code skills for lead sourcing, email finding/verification,
copywriting, and campaign ops. Built on the proven campaign **strategy** from Eric's GrowthEngineX repo,
rebuilt for a different, **multi-provider tech stack**.

**New here?** Run `/cold-email-kickoff` — it asks your stack, then orchestrates ICP → lead magnet →
strategy → plan in one guided flow.

## What makes this repo different
1. **Multi-provider.** Every vendor step asks "which tool are you using?" and adapts. Recommended defaults,
   real alternatives. See [`docs/stack-selector.md`](docs/stack-selector.md).
2. **Bulk-data-first.** ~1.7 GB of pre-scraped US company data (12M businesses, 900K SaaS) is tried BEFORE
   any paid live scrape.
3. **Strategy preserved.** Eric's campaign-strategy + copywriting skills are kept as-is; only the tooling
   changed.
4. **Agency-ready.** Multi-client: each client gets a `profiles/<slug>/` workspace.

## The stack (defaults — alternatives in the stack-selector)

| Job | Default | Alt |
|---|---|---|
| Local businesses | Bulk 12M CSV → **Serper.dev** → Apify | — |
| SaaS/software | Bulk 900K CSV → **AI Ark** → Apify | — |
| Companies + lookalikes | **AI Ark** | Apify |
| Scraping (hiring/LinkedIn/reviews) | **Apify** | Serper |
| Decision-makers + verify emails | **AgenticData** | AI Ark |
| Website fetch/research | **FireCrawl** | Open Web Ninja |
| Storage | **Supabase** | CSV |
| Domains | **Porkbun** | Dynadot |
| Inboxes + warmup | **Inboxkit** | Maildoso · Zapmail |
| Sending | **Plusvibe** | Smartlead |

## Layout
```
README.md              .env.example       .gitignore
docs/                  stack-selector · roadmap · tech-stack-mapping · sharing-and-github
skills/                strategy (kept) + new list/infra/send playbooks
references/            one API-reference doc per tool (source for the scripts)
Common Outbound Lists/ bulk data (git-excluded — see docs/sharing-and-github.md)
profiles/              per-client workspaces (git-ignored)
```

## Getting started
```bash
cp .env.example .env      # fill in keys for your chosen stack
# AgenticData is already MCP-connected; Apify + FireCrawl can be MCP too.
```
Then in Claude Code: `/cold-email-kickoff`.

## Status — Milestone 1 (foundation)
- ✅ Full scaffold, docs, stack-selector, `.env` template
- ✅ Eric's strategy/copy skills copied (campaign-strategy + copywriting unchanged)
- ✅ 8 new skill playbooks for the stack + 14 API-reference docs
- ✅ Bulk data copied in (git-excluded)
- 🔜 **Next milestones:** runnable scripts per tool, Supabase schema creation + bulk load, auto-launcher

## Operating rules (finalized) — see `docs/campaign-workflow-rules.md`
1. **Confirmation gates** — real campaigns run STEP BY STEP with the user's sign-off at every stage
   (ICP → strategy → list → contacts → copy → send). Autonomous end-to-end is testing-only.
2. **Finder order** — AgenticData (MCP, primary) → AI Ark → ColdIQ; verify every email with OptimaVerifier.
3. **Personalization** — default is company-level (FireCrawl AI line) + persona (role-aware), not just merge tags.

## Core principles (kept from Eric)
1% reply-rate rule · positive-reply-rate is the north star · always DRAFT (a human hits Start) · 2-week
warmup · 21-day judging window · B2B only, honor unsubscribes, real physical address.

## Credit
Campaign strategy & copywriting frameworks adapted from GrowthEngineX's open-source Cold Outbound Skills (MIT).
