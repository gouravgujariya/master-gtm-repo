# Roadmap — end-to-end GTM flow (this stack)

The campaign STRATEGY is Eric's, kept intact. The TOOLING is rebuilt for your stack. This is the linear
flow; every list step obeys the **bulk-CSV-first** and **adapt-to-strategy** rules in `stack-selector.md`.

> **⛔ Real campaigns run STEP BY STEP with your sign-off at every `[confirm]` gate below** — feedback at
> each stage makes the best campaign. Autonomous end-to-end is testing-only. See `campaign-workflow-rules.md`.

```
/cold-email-kickoff  (asks your stack first, then orchestrates the below)
  → /icp-onboarding            (FireCrawl scrapes client site + questionnaire → client-profile.yaml) [confirm]
  → /lead-magnet-brainstorm    (pick the free offer) [confirm]
  → /campaign-strategy         (15-25 campaign angles; Deep Research Protocol via FireCrawl) [confirm]
  → infra (if none): /inbox-infrastructure  (Porkbun domains + Inboxkit/Maildoso inboxes → Plusvibe; 2-wk warmup)

  → LIST BUILDING (pick per campaign; ICP-qualify with /icp-prompt-builder): [confirm accounts]
       local businesses  → /bulk-list-builder (12M CSV) → else /serper-local-list-builder → else /apify-list-builder
       SaaS/software     → /bulk-list-builder (900K CSV) → else /ai-ark-companies → else /apify-list-builder
       lookalikes        → /firecrawl-enrich (client case studies) → /ai-ark-companies (lookalike)
       hiring/LinkedIn/signals → /apify-list-builder (pick the actor for the signal)
  → /agenticdata-contacts      (find: AgenticData [MCP, PRIMARY] → AI Ark → ColdIQ last resort; [confirm]
                                verify EVERY email: OptimaVerifier; rescue catch-all if AI Ark VALID)
  → /list-quality-scorecard    (grade before upload)

  → /campaign-copywriting      (direction → subject → body → variants.yaml) [confirm]
                                DEFAULT personalization = company-level (FireCrawl AI line) + persona (role-aware)
  → /email-spintax + /spam-word-checker   (QA / variation)
  → /campaign-upload           (Plusvibe/Smartlead DRAFT — you hit Start manually)

  → 21-day wait
  → /positive-reply-scoring    (north-star metric: positive replies / total sent)
  → /experiment-design         (plan the next variant)
Ongoing: /cold-email-weekly-rhythm  (Mon audit / Wed reply sweep / Fri retros)
```

## Core principles (unchanged from Eric)
- **1% rule:** a healthy domain sustains ≥1% reply rate after 200 sends.
- **Positive reply rate is the north star**, not raw replies.
- **Always DRAFT, never auto-send.** A human hits Start.
- **21 days** before judging a campaign. **2-week warmup** before sending.
- **B2B only, honor unsubscribes, real physical address.**

## What's live vs TODO (Milestone 1)
- **Live now:** all strategy/copy skills, the bulk data, all playbooks + API-reference docs, AgenticData MCP.
- **TODO (next milestones):** runnable scripts for the new stack (Apify/Serper/AI Ark/FireCrawl/Plusvibe/
  Inboxkit/Maildoso/Porkbun), Supabase schema creation + bulk load, and an auto-research-style launcher.

## Troubleshooting tree (kept)
0% replies → check volume / spam words / 1% rule. Bounces >3% → re-verify list (AgenticData). Hostile
replies → re-score + re-target/rewrite. Good replies, no meetings → CTA/lead-magnet problem. All fine but
nothing works → domain reputation; wait or rotate the inbox pool (`inbox-infrastructure`).
