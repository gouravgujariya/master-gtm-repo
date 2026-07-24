# reddit-find — CLI Reference (buyer-language research)

- **Role:** pull **real buyer language, pain points, and objections** from Reddit as structured markdown —
  gold for sharper **copy** (subject lines, situation lines) and a truer **ICP**. "The tool fetches, your AI
  analyzes."
- **Source:** https://github.com/LeadGrowGTM/reddit-find (MIT, LeadGrow). **Installed** (v1.0.0, on PATH).
- **Cost / auth:** FREE, no required key. **Optional** `SERPER_API_KEY` (we have it in `.env`) improves
  subreddit discovery.
- **Type:** Python CLI — Claude Code runs it directly. (Also ships its own Claude Code skill in the repo.)

## Commands
| Command | What |
|---|---|
| `reddit-find discover "<topic>"` | find relevant subreddits for a GTM topic |
| `reddit-find search "<pain phrase>" -s sales --titles-only -o scan.md` | keyword search across Reddit history |
| `reddit-find fetch "<topic>" -s sales -s SaaS --titles-only -o scan.md` | hot/top posts (current landscape) |
| `reddit-find post <reddit-url> -o post.md` | deep-dive one thread + ALL comments |

**Flow:** find threads (`search`/`fetch`, titles-only) → Claude scores titles HIGH/SKIP → `post` the winners
for full comments. Scan first, only pay the rate-limit on posts worth reading.

## How this repo uses reddit-find
- **Step 1 — Research (ICP):** after the website research, run `discover` + `fetch`/`search` on the client's
  market to hear how buyers actually describe the pain → sharpen the ICP + value prop.
- **Step 6 — Copy:** mine the exact phrases + objections buyers use → feed the **company+persona** copy
  (subjects 2-3 words, situation lines). Real venting beats invented positioning.

## ⚠️ Important caveat (Reddit access)
Reddit **403-blocks datacenter/cloud IPs** and heavy automated access. It returns **no data from cloud
environments** (confirmed: `reddit.com/*.json` → HTTP 403 there). It should work from your **local Mac on a
normal connection**. If it 403s locally too, you're being rate-limited/blocked by Reddit — wait and retry,
use a different network, or add Reddit auth. The tool itself is fine; this is Reddit's IP filtering.
