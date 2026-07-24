# TechSight — CLI Reference (free tech-stack detection)

- **Role:** detect each company's **tech stack** from its domain (7,500+ technologies, Wappalyzer signatures).
  Powers the **tech-stack campaign angle**.
- **Position: FALLBACK.** Prefer **AI Ark's `technologies` filter** to *source* companies by tech directly.
  Use TechSight to **detect/confirm** the stack on a list you already have (free), or when AI Ark's tech data
  is thin.
- **Source:** https://github.com/MitchellkellerLG/techsight-cli (MIT, open-source, LeadGrow)
- **Cost / auth:** **FREE — no API key.** Detects from HTTP headers, cookies, meta tags, script srcs, HTML,
  DNS TXT, TLS certs. Default 95% confidence, needs 2+ independent signals.
- **Type:** Python CLI (not Node) — Claude Code runs it directly via the terminal.

## One-time install
```bash
pip install -e ".[dev]"     # from a clone of the repo, OR:  pipx install techsight  (per its README)
techsight stats             # confirm it works
```

## Commands
| Command | What |
|---|---|
| `techsight scan hubspot.com` | tech stack for one domain (`-j` for JSON) |
| `techsight batch a.com b.com` | several domains |
| `techsight enrich -i companies.csv -o enriched.csv --domain-col "domain" --tech-col "tech_stack"` | **the one we use** — adds a tech-stack column to a company CSV |

Enrich notes: skips rows that already have a value (`--overwrite` to replace), 50 concurrent by default
(`--max-workers`), dedupes domains.

## How this repo uses TechSight (tech-stack angle)
1. Source companies as usual → `profiles/<client>/lead-database/companies-<slug>.csv` (has a `domain` column).
2. Enrich: `techsight enrich -i companies-<slug>.csv -o companies-tech-<slug>.csv --domain-col domain --tech-col tech_stack`
3. **Filter** by the campaign's tech criterion — e.g. keep companies that use `Zoho`/`HubSpot`/`Shopify`, or
   that are MISSING a tool your client replaces. (Note: "uses X" is reliable; "missing X" is only a soft
   signal — you can't prove absence.)
4. Continue the normal pipeline on the filtered list: find → verify → copy → draft.

Best when the client's pitch is tech-specific (e.g. "we do Zoho consulting" → target companies on Zoho).
Free, so it's a cheap qualifier to stack on top of any sourced list.
