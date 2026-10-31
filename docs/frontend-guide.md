# GTM Console — Frontend Guide

Brief for whoever builds the UI (a person or an agent). It covers what the product is, how each screen
should look and behave, and exactly which backend endpoints to call.

- **Working reference:** `ui-prototype/index.html`. A single-file vanilla build that already runs
  against the real API. Open it via the API at http://localhost:3000 and copy its behaviour.
- **Backend contract (source of truth):** `docs/backend-contract.md`. If this guide and the contract
  disagree, the contract wins. Tell the backend team rather than working around it.
- **Data shapes:** `src/agents/schemas.ts` (zod). Copy the types from there.
- **Demo data:** `fixtures/demo/scriptlens.json`. These are real-shaped results; use them for stories and tests.

---

## 1. What the product is

An internal console for **our team only** (no public signup). An operator enters a client's website, and
the system works through a fixed outbound strategy in 6 steps. **A human approves every step before the
next one can run.** At the end it creates a **DRAFT** campaign in Plusvibe, and a human clicks Start there.

> "Get 1 to 3 hot leads in 24 hours." The client sees the result. The operator sees every step.

### Non-negotiable UX rules (these come from the GTM strategy, not taste)
1. **Approve at every step.** Never auto-advance, except in demo auto-play (§7).
2. **No sourcing before a campaign angle is approved.** The backend enforces this with `409 GATE`. The UI
   should make the order obvious anyway.
3. **Every email is verified.** Always show which leads are *sendable / held / dropped*. Never hide the
   held or dropped ones.
4. **DRAFT only.** The final button says "Create draft in Plusvibe", never "Send" or "Launch". After
   it succeeds, say: *"Draft created — a human must click Start in Plusvibe."*
5. **Paid sourcing needs a reason.** Lookalike sourcing costs money, so require a typed reason before
   enabling it.
6. **No card or payment UI.** This is an internal tool.

---

## 2. Stack and local setup

| | Recommendation |
|---|---|
| Repo | separate `gtm-ui` repo (planned). The prototype stays as the reference. |
| Framework | Vite + React + TypeScript. Plain fetch, or TanStack Query for server state. |
| Styling | CSS variables from §8 (Tailwind is fine if the tokens are mapped). |
| Dev port | `5173` (already in the backend's `CORS_ORIGIN` default) |
| Backend | `npm run dev` in this repo → API on `http://localhost:3000` (+ the worker) |

**Use a Vite proxy** so the browser sees one origin, which avoids most cookie and CORS issues:
```ts
// vite.config.ts
server: { proxy: { "/api": "http://localhost:3000", "/auth": "http://localhost:3000", "/health": "http://localhost:3000" } }
```
Without the proxy, call `http://localhost:3000` with `credentials: "include"` and open
`EventSource(url, { withCredentials: true })`. CORS is already set up with credentials for `CORS_ORIGIN`.

**In production (Railway)** the UI may live on its own domain. Session cookies are then
`SameSite=None; Secure`, so you need `credentials: "include"` everywhere, and the backend's
`CORS_ORIGIN` must list the UI domain.

**First login:** `npm run user:add -- --email=you@x.com --password=... --role=admin` (in the backend repo).

---

## 3. API basics

- JSON in and out. Every request uses `credentials: "include"` (the session is an httpOnly cookie, `sid`, valid 14 days).
- **Errors always look like** `{ "error": { "code": "GATE", "message": "...", "needs"?: "strategy" } }`.
- Ids are UUIDs. Field names are camelCase.

### Error codes → what the UI does

| HTTP | code | UI behaviour |
|---|---|---|
| 401 | `UNAUTHORIZED` | show the login screen (any request can return this) |
| 401 | `BAD_LOGIN` | "Wrong email or password" under the form |
| 400 | `VALIDATION` | inline field error / toast with `message` |
| 404 | `NOT_FOUND` | "Not found". Drop the bad id from the URL and go home |
| 409 | `GATE` | toast: "Approve **{needs}** first". Highlight that step |
| 409 | `NOT_READY` | "This step's job hasn't finished yet" |
| 409 | `NOT_WIRED` | "This angle isn't automated yet". Suggest another dataset |
| 422 | `LOOKUP_FAILED` | landing-page suggestion: "Couldn't read that site", but still allow continuing |
| 402 | `LLM_BUDGET` | "Daily AI budget reached". Job error state |
| 502 | `LLM_ERROR` / `LLM_BAD_OUTPUT` | job error state with a **Retry** button |
| 400 | `NO_WEBSITE` `NO_CAMPAIGN` `NO_CONTACTS` `NO_SEEDS` `NO_SENDABLE_LEADS` | job error. Show `message`; the user fixes the input |

### Endpoints

| Method | Path | Body → Response |
|---|---|---|
| GET | `/health` | `{ok:true}` |
| POST | `/auth/login` | `{email,password}` → `{user:{id,email,role}}` + sets cookie |
| POST | `/auth/logout` | → `{ok:true}` |
| GET | `/auth/me` | → `{user, demoMode: "off"\|"auto"\|"on"}` · 401 if logged out |
| GET | `/api/lookup?url=` | → `{domain,name,description,favicon}` · 422 `LOOKUP_FAILED` |
| GET | `/api/clients` | → `[{id,name,website,campaigns:[{id,name,status}]}]` (sidebar) |
| POST | `/api/clients` | `{website}` **or** `{name, description?, questionnaire?}` → 201 client |
| GET | `/api/clients/:id` | → `{client, profile, approvals, campaigns, latestJobs}` |
| PATCH | `/api/clients/:id/profile` | `{icp?, angles?, contextMd?}` → profile ⚠ **revokes `icp` and every later approval** |
| POST | `/api/clients/:id/campaigns` | `{name, angle, persona?, segment?, targeting?}` → 201 campaign |
| GET | `/api/campaigns/:id` | → `{campaign, latestJobs, companies, contacts}` |
| PATCH | `/api/campaigns/:id` | `{name?, sequence?}` → campaign |
| PATCH | `/api/campaigns/:id/leads/:contactId` | `{personalization?, status?: "selected"\|"excluded"}` → lead |
| POST | `/api/jobs` | `{clientId, campaignId?, type, input?}` → 202 `{jobId}` · 409 `GATE` |
| GET | `/api/jobs/:id` | → job |
| GET | `/api/jobs/:id/events` | **SSE** live log + status (see below) |
| POST | `/api/jobs/:id/cancel` | → `{ok:true}` |
| POST | `/api/approvals` | `{clientId, campaignId?, stage, decision: "approved"\|"rejected", note?}` → approval |
| POST | `/api/campaigns/:id/draft` | → 202 `{jobId}` (approves `send` **and** starts the Plusvibe draft) |

### Key objects
```ts
type Job = { id; clientId; campaignId|null; type: JobType; status: "queued"|"running"|"done"|"error"|"cancelled";
             input; result; log: string /* newline separated */; createdAt; startedAt; finishedAt };
type Approval = { id; clientId; campaignId|null; stage: Stage; decision: "approved"|"rejected"|"revoked"; decidedAt; note };
// result extras: result.demo === true → fixture data (show DEMO badge); result.costUsd (AI jobs); result.error on failure
```
**"Is a stage approved?"** Take the approvals for that stage (client-level rows have `campaignId: null`;
campaign rows match the campaign) and look at the **latest by `decidedAt`**. Only `approved` counts;
a later `revoked` or `rejected` wins.

### Live job progress (SSE)
```ts
const es = new EventSource(`/api/jobs/${jobId}/events`, { withCredentials: true });
es.addEventListener("log",    (e) => appendLog(JSON.parse(e.data).line));
es.addEventListener("status", (e) => { const { status, result } = JSON.parse(e.data);
  if (["done","error","cancelled"].includes(status)) { es.close(); onFinished(status, result); } });
es.onerror = () => { /* stream closed: fall back to GET /api/jobs/:id once */ };
```
The stream first replays the log so far, so reopening it after a reload is safe. After `done`, **re-fetch
the client and campaign** (the worker writes results into the DB) and render from that, not only from `result`.

---

## 4. The flow: steps ↔ jobs ↔ approvals

| # | UI step | Level | Job(s) to run | Stage to approve | Renders from |
|---|---|---|---|---|---|
| 1 | Research your company | client | `research` `{website?}` | `icp` | `profile.icp` |
| 2 | Explore competitors | client | `competitors` | `competitors` | `profile.icp.competitors`, `profile.icp.queries` |
| 3 | Define campaigns | client → **creates the campaign** | `segments` | `strategy` (campaign) | `profile.angles.segments` |
| 4 | Find potential customers | campaign | `source` (input from the targeting form) | `companies` | `campaign.companies` |
| 5 | Find decision makers | campaign | `find` `{titles}` | `contacts` | `campaign.contacts` |
| 6 | Write emails | campaign | `verify`, **then** `copy` `{method}` | `copy` | contacts + `campaign.sequence` |
| ✓ | Outreach ready | campaign | `draft` via `POST /api/campaigns/:id/draft` | (`send`, automatic) | draft result |

**The step state machine** (same for every step):
1. Find the latest job of the step's type: client steps use `client.latestJobs[type]`; campaign steps use
   `campaign.latestJobs[type]`.
2. No job, or `error`/`cancelled` on an explicit Retry → `POST /api/jobs` → stream it.
   `queued`/`running` → stream it. `done` → render the result. `error` → show the error and a **Retry** button
   (never re-run on its own).
3. Rendered result + **Approve** button → `POST /api/approvals`. On success move to the next step.
4. **Resume:** after login or reload, the current step = the first stage that isn't approved. Keep
   `clientId`/`campaignId` in the URL (e.g. `/c/:clientId/k/:campaignId`) so a reload restores it.

**Going back:** the operator may revisit and edit an earlier step. Editing the profile, or re-approving an earlier
stage, makes the backend **revoke every later approval**. Show those steps as "needs re-approval",
not as broken.

### Step details

**Step 1 — Research.** A company card: name, domain, description, founded, employees, geo, keyword chips,
product title + 3 points (`Icp` schema). A "Details look off?" link edits the description through `PATCH profile`
(warn that this resets later approvals).

**Step 2 — Competitors.** 3 search queries + up to 15 competitor cards `{domain, name, why}`.

**Step 3 — Campaigns.** 6 segment cards, one selectable: `name, icon, sizeEstimate, desc, pain,
criteria[], examples[], angle, valuePropCategory`. Under the selected card, a **targeting form**
pre-filled from `segment.targeting`:
- `dataset`: `saas` | `local` | `lookalike` (`none` → default to saas)
- saas filters: `industry`, `location`, `size` · local filters: `category`, `state`
- `titles` (decision-maker titles, comma list) · `seedDomains` (lookalike) · `limit` (default 50)
- lookalike → a **required "reason"** field (paid)

On **Approve**: `POST /api/clients/:id/campaigns {name, angle, segment, targeting}` (only if this segment
has no campaign yet), then `POST /api/approvals {stage:"strategy", campaignId}`. The saved
`campaign.targeting` restores the form after a reload.
Angles `new-hire, hiring, competitor-engagers, tech-stack` aren't automated (`409 NOT_WIRED`). Mark them "manual".

**Step 4 — Companies.** `source` input =
`{dataset, filters:{...}, seedDomains?, limit, allowPaid?:true, reason?}`. A table with columns company (name + domain),
industry, location, size, and a source chip (`listSource`).

**Step 5 — Decision makers.** `find` input = `{titles:[...]}`. A table with columns avatar initials + name +
LinkedIn link, title, company, and a "found by" chip from `findSource`.

**Step 6 — Emails.** Runs `verify`, then `copy` (method picker: `default` | `braun`). Left: the list of people
with **finder chips** (AgenticData → AI Ark → ColdIQ waterfall; highlight the one in `findSource`) and a
**verdict badge**:

| `emailStatus` | `sendable` | Badge |
|---|---|---|
| valid | true | green "verified" |
| catch-all | true | green "catch-all → rechecked" |
| catch-all | false | amber "catch-all · held" |
| unknown | false | amber "unknown · held" |
| invalid | false | red "dropped" |

Show `verifyNote` as a tooltip. Right: the **email editor** for the selected person:
- To, Subject (`campaign.sequence.subject`, shared, 2–3 words)
- Body = `contact.personalization.body` (**per person**, editable)
- Follow-ups = `campaign.sequence.sequence.slice(1)` (`{step, waitDays, body}`, **shared**, editable)
- Saving (debounce ~600ms): body → `PATCH /api/campaigns/:id/leads/:contactId {personalization:{...p, body}}`;
  subject/follow-ups → `PATCH /api/campaigns/:id {sequence}`
- Not sendable → show "excluded from draft". Optional per-lead "exclude" → `PATCH lead {status:"excluded"}`.

**Final — Outreach ready.** Tabs Companies / People / Emails, a "What happens next" strip (7 Launch in
Plusvibe · 8 Replies land in the inbox · 9 Book meetings), and the **Create draft** modal:
- counts from `campaign.latestJobs.verify.result.counts` → "**11** verified will be drafted · **3** held · **1** dropped"
- rules text: "Only verified emails are uploaded. Campaign is created as DRAFT."
- button "Create draft in Plusvibe" → `POST /api/campaigns/:id/draft` → stream the log inside the modal →
  show `result.externalCampaignId`, `result.uploaded`, and *"Draft created — a human must click Start in Plusvibe."*

---

## 5. Screens and layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Login (centered card: email, password, "Sign in")                        │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────┐
│ Home / New client                                                        │
│  Hero: "Get 1 to 3 hot leads in 24 hours"                                │
│  [ https://client-site.com            ] [Start →]                        │
│   └ suggestion: favicon · name · description   (GET /api/lookup, 400ms)  │
│  "I don't have a website" → form: name, description, questionnaire      │
└──────────────────────────────────────────────────────────────────────────┘
┌───────────────┬──────────────────────────────────────────────────────────┐
│ SIDEBAR 280px │ Banner (step ≥ 4): "Your campaign is almost ready…"      │
│ • Client name │ Stepper: ① Research ② Competitors ③ Campaigns            │
│ • Step summary│          ④ Companies ⑤ People ⑥ Emails                  │
│   (✓ approved,│ ┌──────────────────────────────────────────────────────┐ │
│    ● current, │ │ Step content (cards / table / editor)                │ │
│    ○ locked)  │ │ [DEMO DATA] badge if result.demo                     │ │
│ • Campaigns   │ │                                                      │ │
│   list        │ │                         [ Approve <stage> → ]        │ │
│ • Agent log   │ └──────────────────────────────────────────────────────┘ │
│   (live SSE,  │ Loading state: spinner + "Agent is working…" + last log  │
│    mono font) │ Error state: message + [Retry]                           │
│ • Log out     │                                                          │
└───────────────┴──────────────────────────────────────────────────────────┘
```
- **Sidebar:** the client list comes from `GET /api/clients`; clicking a client or campaign loads it.
- **Stepper states:** done (✓ green), current (ink), locked (faint, not clickable), needs re-approval (amber).
- **Agent log:** the newest line at the bottom, auto-scroll, JetBrains Mono 12px, typing feel optional.
- **Mobile:** sidebar collapses into a drawer; tables scroll horizontally inside their card.

---

## 6. Job states → UI states

| Job status | UI |
|---|---|
| none | auto-start the step's job when the step is entered (never for `draft`) |
| `queued` | "Waiting for worker…" + spinner |
| `running` | "Agent is working…" + live log |
| `done` | render the result + Approve button |
| `error` | `result.error` (fallback: last log line) + Retry |
| `cancelled` | "Cancelled" + Retry |

Allow **Cancel** on long jobs (`POST /api/jobs/:id/cancel`).

---

## 7. Demo mode

`GET /auth/me → demoMode`:
- `"on"` → every job returns fixture data. Show a demo bar with **Auto-play** (it approves steps by itself
  at speed 1×/2×/4×; with lookalike it fills the reason with "demo auto-play"), **Restart**, and a speed picker.
  Even in auto-play a human still clicks "Create draft".
- `"auto"` → live where API keys exist, fixtures where they're missing. No auto-play.
- `"off"` → live only.
- Whenever `job.result.demo === true`, show a **DEMO DATA** badge on that step. Never present demo data as real.

---

## 8. Visual design

Calm, light and editorial: white cards on a warm off-white background, black ink, green only for success and sendable.
The prototype's look is the reference (it follows the demo video the client liked).

```css
:root{
  --bg:#f6f6f3; --card:#fff; --ink:#141414; --muted:#6f6f6a; --faint:#a3a39d; --line:#e7e7e2;
  --green:#15a34a; --green-ink:#0f7a37; --green-bg:#e9f8ef;
  --amber:#b7791f; --amber-bg:#fdf3e1; --red:#c2410c; --red-bg:#fdece4; --blue:#2563eb;
  --r:12px; --mono:'JetBrains Mono',ui-monospace,monospace;
}
```
- **Fonts:** Inter 400/500/600/700 (UI), JetBrains Mono 400/500 (log, emails, domains), from Google Fonts.
- **Cards:** `--card` background, 1px `--line` border, radius `--r`, 16–20px padding, no heavy shadows.
- **Buttons:** primary = ink background + white text; success (Approve / Create draft) = `--green`; ghost = border only.
- **Badges/chips:** pill, 11–12px, tinted bg + strong text (`--green-bg`/`--green-ink`, amber, red).
- **Motion:** short fade-in (150–200ms) on step content; respect `prefers-reduced-motion`.
- Add dark mode later; keep every colour behind these tokens so it's a token swap.
- Accessibility: real `<button>`s, visible focus rings, the form has `<label>`s, and the badge colour is never the
  only signal (badges also have text).

---

## 9. Suggested component list
`LoginPage` · `HomePage` (`UrlInput` + `LookupSuggestion` + `NoWebsiteForm`) · `ClientLayout` (`Sidebar`,
`Stepper`, `AgentLog`, `ReadyBanner`) · `StepShell` (loading/error/done + Approve) · `CompanyCard` ·
`CompetitorsGrid` · `SegmentCards` + `TargetingForm` · `CompaniesTable` · `PeopleTable` · `EmailList` +
`VerdictBadge` + `FinderChips` + `EmailEditor` · `OutreachReady` (tabs) · `DraftModal` · `DemoBar` ·
`DemoBadge` · `Toast`.
Hooks: `useMe()`, `useClient(id)`, `useCampaign(id)`, `useJobStream(jobId)`, `useApprove()`.

---

## 10. Done checklist (acceptance)
- [ ] Logged out → login; after login, reload keeps the session and the URL restores the client/campaign + step.
- [ ] The website lookup suggestion appears; a 422 still lets the user continue.
- [ ] Every step: job auto-starts → live log streams → result renders → Approve → next step unlocks.
- [ ] Skipping ahead is impossible in the UI, and a `409 GATE` from the API shows "Approve X first".
- [ ] Editing step 1 or re-approving an earlier step shows later steps as "needs re-approval".
- [ ] Lookalike sourcing can't start without a reason.
- [ ] Email badges match the table in §4. Held and dropped are visible, not hidden.
- [ ] Body and subject edits persist (reload shows them).
- [ ] The draft modal shows counts, streams the log, and ends with "a human must click Start in Plusvibe".
- [ ] DEMO DATA badge whenever `result.demo`. Auto-play only when `demoMode === "on"`.
- [ ] Works at 375px width with no horizontal page scroll.
- [ ] End-to-end against the backend: `DEMO_MODE=on npm run dev`, then click through, or run `npm run smoke`.
