# Tech-Stack Mapping — Eric's tools → your stack

Use this when reading the copied strategy skills: wherever a skill names one of Eric's tools as an example,
substitute your equivalent below (per `stack-selector.md`). The strategy/copy skills are kept as-is on
purpose — only the tooling changes.

| Function | Eric's tool | Your stack |
|---|---|---|
| Company scraping / signals | RapidAPI (Maps, LinkedIn) | **Apify** (MCP) |
| Local business scraping | RapidAPI Google Maps | **Serper.dev** + bulk 12M CSV first |
| Company sourcing + lookalikes | Prospeo / DiscoLike | **AI Ark** + bulk 900K CSV first |
| Decision-makers + email find | Prospeo / Blitz | **AgenticData** → **AI Ark** → **ColdIQ** (last resort) |
| Email verification | MillionVerifier | **OptimaVerifier** (primary; catch-all cross-check vs AgenticData) |
| Website fetch / research | raw `fetch` + regex | **FireCrawl** (MCP) |
| News / PR enrichment | OpenWebNinja | **Open Web Ninja** (optional) + FireCrawl |
| AI reasoning | OpenRouter | **Claude Code** (native) |
| Data storage | flat CSV files | **Supabase** (+ CSV artifacts) |
| Domains | Dynadot | **Porkbun** (Dynadot still supported) |
| Inboxes + warmup | Zapmail | **Inboxkit** / **Maildoso** (Zapmail still supported) |
| Sending | Smartlead / Instantly | **Plusvibe** (Smartlead still supported) |

## Skill lineage
- **Copied unchanged (strategy/process):** campaign-strategy, campaign-copywriting, icp-onboarding,
  icp-prompt-builder, lead-magnet-brainstorm, personalization-subagent-pattern, spam-word-checker,
  list-quality-scorecard, experiment-design, cold-email-weekly-rhythm, deliverability-incident-response.
- **Copied + lightly neutralized:** cold-email-kickoff (asks your stack), email-spintax (was smartlead-spintax).
- **Copied, framework kept, vendor scripts = porting reference (rebuild TODO):** positive-reply-scoring,
  email-deliverability-audit (its `check-domain-auth.ts` is vendor-neutral and kept live).
- **New for your stack (playbooks now, scripts TODO):** bulk-list-builder, ai-ark-companies,
  apify-list-builder, serper-local-list-builder, agenticdata-contacts, firecrawl-enrich,
  inbox-infrastructure, campaign-upload.
