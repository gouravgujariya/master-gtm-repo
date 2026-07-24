# START HERE — your GTM system, explained simply

This is your complete cold-outbound GTM system for A for Analytics. This guide is written for you
(non-technical) and is the first thing to read whenever you come back.

---

## The 3 ways to use it

| # | What | For |
|---|---|---|
| 1 | **Local app** (`npm run app` → a web page on your computer) | Operating the pipeline: source → find → verify → draft |
| 2 | **Team dashboard** (hosted on Vercel) | Your team VIEWS data from anywhere (view-only) |
| 3 | **Claude Code** (chat in this folder) | Doing a campaign step-by-step with feedback at each stage |

---

## How to open the LOCAL APP (step by step)

1. Open the **Terminal** app.
2. Go into the repo folder — type this and press Enter:
   ```
   cd "/Users/krishnabytes/Downloads/AFA GTM repo/Master GTM Repo"
   ```
3. **First time only** (installs the tools): type `npm install` and press Enter, wait for it to finish.
4. Start the app: type **`npm run app`** and press Enter.  ⚠️ It's `npm run app`, NOT `npx run app`.
5. It prints a link: **http://localhost:4317** — open that in your browser (Chrome/Safari). ✅ That's your dashboard.
6. To **stop** the app: click back in the Terminal and press **Ctrl + C**.

> "localhost:4317" just means "a web page running on your own computer." It only works while the
> Terminal is running `npm run app`. Nobody else can see it — it's private to your machine.

**Requirements for it to work:** you must be in the `Master GTM Repo` folder, have run `npm install` once,
and have your API keys in the `.env` file (they're already there in this folder).

---

## Doing a GTM campaign for a CLIENT

Each client gets their own folder under `profiles/<client>/`:
- `inputs/` → drop the client's **questionnaire + case studies + any documents** here
- `lead-database/` → where all the **leads + the final campaign file** come out
- `context.md`, `client-profile.yaml` → the brief (who they are, ICP, persona)

### Option A — using the local app (easiest, buttons)
1. Open the app (steps above).
2. Click **+ New client**, type the client's name. It creates the folder.
3. At the top, set the **Campaign** name, **Persona** (the job title you target, e.g. "Owner"), **Segment**, **Market**.
4. Run the 4 stages **in order**, waiting for each to finish (watch the "Run output" box):
   1. **Source companies** → 2. **Find decision-makers** → 3. **Verify emails** → 4. **Draft to Plusvibe**
5. The **Contacts / Companies** tables show your live data. The Plusvibe draft is created (never sent — you review + Start it yourself in Plusvibe).

### Option B — using Claude Code (best for real clients — step-by-step with feedback)
Open this folder in Claude Code and say something like:
> "Run a GTM campaign for **<client name>**, step by step. Research their site, confirm the ICP with me,
> build the lookalike list, confirm, find contacts, verify, write company+persona copy, then draft to Plusvibe.
> Stop and get my approval at each stage."

Claude follows the **confirmation gates** — it pauses for your sign-off at every stage (ICP → list → contacts →
copy → send). This is the recommended way for real clients, because your feedback each step makes the best campaign.

> Whether you use the app or Claude Code, the campaign is always created as a **DRAFT** — a human reviews it
> and clicks **Start** in Plusvibe. Nothing sends automatically.

---

## Supabase — explained in plain English

**What it is:** Supabase is your **cloud database + file storage** (like a smart spreadsheet + Google Drive
that lives online). It's where all your GTM data is kept so it's never lost and everyone sees the same thing.

**What's stored there:**
- **Tables** (spreadsheet grids): `companies` and `contacts` — every account and person you've found, tagged
  by client. View them in the Supabase **Table Editor** (a grid you can sort/filter).
- **Files** (a bucket called `gtm-lists`): CSV list snapshots per client.

**The two keys (this is the part you asked about):**
- `sb_secret_...` = the **master key** (full read + write access — the "admin" key).
- `sb_publishable_...` = the **public key** (limited, safe to expose).

**"Master key is server-side only, never sent to the browser" — what that means:**
Think of the master key like the **master key to your filing cabinet**.
- The **server** (the code running the app on your computer, or the Vercel function for the team dashboard)
  is the **locked back office**. The master key is kept there.
- The **browser** (the web page you look at) is the **front desk**. It never receives the master key — it just
  asks the back office "show me the contacts," and the back office fetches them using the key.
- **Why it matters:** if the master key were put into the web page itself, anyone who opened the page could
  copy it and get full access to your database. Keeping it in the back office (server-side) prevents that.

So: your web pages show the DATA, but the KEY that unlocks the database stays hidden on the server. ✅

---

## Your links + password (keep these)

| Thing | Link |
|---|---|
| **GitHub repo** (the code, backed up) | https://github.com/krishna-designwork/master-gtm-repo |
| **Workflow diagram** (visual explainer, public) | https://workflow-dusky-rho.vercel.app |
| **Team dashboard** (view-only, hosted) | https://hosted-pearl-phi.vercel.app |
| **Team dashboard password** | `LKxuvjf8gdLF`  _(change it: Vercel → project "hosted" → Settings → Environment Variables → DASHBOARD_PASSWORD → edit → redeploy)_ |
| **Supabase dashboard** | https://supabase.com/dashboard/project/pwquvcpgwwicdsqsuppa |
| **Plusvibe** | https://app.plusvibe.ai |

> ⚠️ The password above is saved here for your convenience. This repo is **private**. If you ever make it
> public, change the password first.

---

## The rules we always follow (baked into the system)
- **Real client campaigns run step-by-step with your sign-off** at each stage (autonomous is testing-only).
- **Always DRAFT** — a human hits Start in Plusvibe.
- **Find waterfall:** AgenticData (primary) → AI Ark → ColdIQ. **Verify:** OptimaVerifier (+ AI Ark rescue).
- **Personalization:** Eric's copy rules + the company+persona variant (subjects 2–3 words).
- **Bulk data first** for sourcing (the 12M / 900K local CSVs) before paid scraping.

Full detail: `docs/campaign-workflow-rules.md`, `docs/stack-selector.md`, `docs/roadmap.md`.

---

## If you ever set this up on a NEW computer (or fresh GitHub download)
The GitHub repo does **not** include your secret keys, the 1.7 GB bulk CSVs, or `node_modules` (on purpose).
On a fresh copy you'd need to: (1) `npm install`, (2) copy `.env.example` to `.env` and paste your keys,
(3) copy the `Common Outbound Lists/` bulk CSVs in. **But your current local folder already has all of this** —
just use it directly.

## Command cheat sheet (advanced / optional)
```
npm run app                 # open the local dashboard (http://localhost:4317)
npm run new-client -- --name="Acme Co"     # create a client folder
npm run bulk-list -- --dataset=saas --limit=50 --push --client="Acme Co"
npm run agenticdata-find -- --in=... --out=... --title="Owner"
npm run verify-emails -- --in=... --out=... --push --client="Acme Co"
npm run plusvibe-upload -- --leads=... --sequence=... --max=10
```
