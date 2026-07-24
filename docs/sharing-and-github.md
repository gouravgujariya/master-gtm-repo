# Sharing this repo & GitHub

You asked how sharing works given the big bulk-data files. Here's the plan.

## The problem
The `Common Outbound Lists/` bulk data is ~1.7 GB:
- `Google Maps Scrape - 12M US Businesses/` (13 CSVs, ~1.55 GB)
- `us-software-saas-companies-cleaned.csv` (~262 MB)
- `us-zip-codes.csv` (~3 MB, small)

**GitHub rejects any single file >100 MB** and would choke on a repo this size. So the bulk data can't go
into a normal GitHub repo.

## What we do
- **Code + docs + skills → GitHub** (small, fast, shareable). This is the valuable, reusable part.
- **Bulk CSVs → git-excluded** (see `.gitignore`) and shared **out-of-band**: Google Drive, S3, or a direct
  download link. A teammate clones the repo, then downloads the bulk data into `Common Outbound Lists/`.
- `us-zip-codes.csv` is small enough to commit if you want the geo-driver always present — but by default
  the whole `Common Outbound Lists/` folder is ignored for simplicity.

## Handoff steps for a teammate
1. `git clone <repo>` (gets code, skills, docs — not the bulk data).
2. Download the bulk data bundle (you share the link) into `Common Outbound Lists/`.
3. `cp .env.example .env` and fill in their own API keys.
4. Start with `/cold-email-kickoff`.

## If you later want the data IN the repo
Use **Git LFS** (Large File Storage) — it stores big files outside normal git history. Documented here as
the upgrade path; not set up now to keep things simple. Note LFS has its own storage/bandwidth quotas.

## Also git-excluded
- `.env` (secrets — never commit)
- `profiles/` (client data — private)
