# CLAUDE.md — GTM operating instructions (read automatically by Claude Code)

## Trigger
When the user says **"GTM"** (or runs **/gtm**), or asks to run a campaign / onboard a client / build a
GTM strategy → **start the GTM Orchestration below.**

**The rule of this repo:** the STRATEGY is fixed (Eric's, kept). The STACK is customized per user — if a
tool isn't wired yet, you build a script for it. Run **step by step and get the user's sign-off at EVERY
stage. Never skip ahead. Never source before the strategy is shown and approved.**

---

## GTM Orchestration

### Step 0 — Collect inputs FIRST (before anything else)
Ask the user for these and save them into `profiles/<client>/inputs/`:
- the client's **website URL**
- the **onboarding questionnaire** (paste text or a file)
- any **call transcripts**
- any other docs (case studies, decks, existing customer list, brand assets)

Create the client folder if needed: `npm run new-client -- --name="<client>"`. Save the website + notes into
`profiles/<client>/context.md` / `client-profile.yaml`. **Do not proceed until you have at least the
website + questionnaire.**

### Step 0b — Confirm the GTM stack (customize the tooling)
Ask which tools the user runs for each job: **sourcing / company data / finding contacts / verifying emails /
sending / inboxes / domains**. Compare against `docs/stack-selector.md`.
- If a tool is already wired (has a script + a `references/*-api.md`), use it.
- **If a tool has NO script, CREATE one.** Ask the user for its **API docs (URL) + API key**, read the docs,
  then write a script in the SAME pattern as the existing ones (see `skills/agenticdata-contacts/scripts/*.ts`
  or `scripts/*.ts`): add the key to `.env`/`.env.example`, add an `npm run` alias in `package.json`, add a
  `references/<tool>-api.md`, and (if it's a stack default) note it in `docs/stack-selector.md`. Keep the
  strategy identical — only the stack changes.

### Step 1 — Research → ICP (confirm)
FireCrawl-research the website + read everything in `inputs/` → draft the ICP into `client-profile.yaml`
(persona, industries, geography, value prop, lookalike seed domains from their case studies) → **show it and
get confirmation / edits.**
Optional: **`reddit-find`** to hear how buyers actually describe the pain (sharpens ICP + copy) — see
`references/reddit-find-cli.md`.

### Step 2 — SHOW THE CAMPAIGN ANGLE MENU, then plan (CRITICAL — never skip)
**Always present the full menu of campaign angles from `docs/campaign-angles.md`** (Eric's strategy set). Then:
- Ask **which angle(s)** the user wants to run first (they may pick several to test variations).
- Ask if the client has **their own angle or an existing GTM strategy** — if yes, **build a campaign plan
  around THAT too**, alongside the standard ones, and add it to `docs/campaign-angles.md` so it's reusable.
- Write a short **plan per chosen angle** (targeting + AI approach + value prop) and **confirm before
  sourcing.** Use `skills/campaign-strategy` to generate the full angle set if the user wants options.

### Steps 3–7 — Execute the approved plan (confirm at each gate)
3. **Source companies** — bulk lists first (`bulk-list`), then AI Ark lookalikes / the chosen angle's tool
   (Apify for hiring, Serper for local, etc.) → review accounts.
4. **Find decision-makers** — AgenticData (primary) → AI Ark → ColdIQ → review.
5. **Verify emails** — OptimaVerifier (+ AI Ark catch-all rescue) → review.
6. **Copy** — choose a method: Eric's rules + **company+persona** variant (default), or the **Braun /
   Poke-the-Bear** method (`skills/braun-copywriting` — illumination questions + 6-element structure).
   Mine real buyer phrases/objections with `reddit-find`. Subjects 2–3 words → review/edit.
7. **Draft to Plusvibe** — verified leads → **DRAFT** (a human hits Start).

---

## Non-negotiables
- **Inputs first**, then stack, then research, then **show the strategy menu and get the pick — before any
  sourcing.**
- **Support the client's own angles**; let the user add new angles to the menu to test variations.
- **Confirm at every stage.** Always DRAFT. Verify every email. Bulk lists first.
- **Customize the STACK** (build scripts for new tools from their API docs); **keep the STRATEGY** (Eric's).

## Key files
- `docs/campaign-angles.md` — the strategy menu (show this in Step 2)
- `docs/campaign-workflow-rules.md` — the operating rules
- `docs/stack-selector.md` — the tool matrix (customize per client)
- `skills/campaign-strategy` — Eric's full angle generator · `skills/campaign-copywriting` — copy rules
- `START-HERE.md` — human guide
