---
description: Start the guided GTM orchestration (inputs → stack → research → strategy menu → execute)
---

Start the **GTM Orchestration** defined in `CLAUDE.md`. Run it step by step and get my sign-off at every stage — never skip ahead, and never source before the strategy menu is shown and approved.

1. **Collect inputs first** — ask me for the client's website URL, onboarding questionnaire, and any call transcripts (+ other docs). Save them to `profiles/<client>/inputs/` (create the client with `npm run new-client` if needed).
2. **Confirm the GTM stack** — ask which tools I use for each job; if a tool has no script yet, ask for its API docs + key and build one in the existing pattern (`.env`, npm alias, `references/<tool>-api.md`).
3. **Research → ICP** — FireCrawl the site + read the inputs → draft the ICP → confirm with me.
4. **Show the campaign angle menu** (`docs/campaign-angles.md`) — let me pick one or more, or give my own angle / existing GTM strategy (build a plan around it too). Confirm the plan before sourcing.
5. **Execute** — source → find (AgenticData → AI Ark → ColdIQ) → verify (OptimaVerifier) → copy (Eric's rules + company+persona) → draft to Plusvibe (always DRAFT). Confirm at each step.

Keep the strategy fixed (Eric's); customize only the stack.
