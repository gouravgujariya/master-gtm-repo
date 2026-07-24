# Poke the Bear — Josh Braun Cold Email Skill for Claude Code

A Claude Code skill that teaches an LLM to write cold emails using Josh Braun's Poke the Bear methodology — the most principled cold email system I've encountered. No templates. No tricks. Every element earns its place through a specific principle.

All frameworks and psychology come from Josh's [Poke the Bear course](https://joshbraun.com). This skill is a faithful Claude Code adaptation. **If you use this, buy his course.**

---

## What's Inside

- **6-Element Email Structure** — TRUTH → THINK → Cost of Inaction → Third Party Validation → Curiosity Pique → Low-Friction CTA
- **Illumination Question Construction** — 4 question frames with examples and quality tests
- **Crispy Emails** — The calorie rule, 3-pass cutting process, why 5 lines wins
- **One Chess Move Per Follow-Up** — Never bump. Always advance with a new angle.
- **4 Phrases to Never Use** — And what to say instead
- **Door Openers vs Door Slammers** — Pass the commission breath test
- **CTA Patterns** — 6 low-friction patterns (5-word reply test)
- **Step-by-Step Email Building Process** — From customer quote to finished email in 5 steps
- **Poke the Bear Question Matrix** — Build 6-8 illumination questions per prospect
- **16-Point Review Checklist** — Quality gate for every email

Full content: [`SKILL.md`](./SKILL.md)

---

## Installation

```bash
mkdir -p .claude/skills/braun-copywriting
cp SKILL.md .claude/skills/braun-copywriting/SKILL.md
```

Claude Code auto-discovers it. Trigger with `/braun-copywriting` or any trigger phrase ("poke the bear email", "illumination question", "braun copywriting").

---

## Usage

The skill activates when you ask Claude Code to write cold email copy:

- "Write a Braun-style cold email for a VP of Sales at a SaaS company"
- "Build a poke the bear question matrix for this ICP"
- "Review this email against Braun principles"
- "Help me write crispy cold email copy for this prospect"

For campaign operations (formatting, spintax, ESP upload), pair with [LeadGrow's open-source outbound tools](https://github.com/LeadGrowGTM).

---

## License

MIT. Cold email principles and Poke the Bear methodology are the intellectual property of Josh Braun ([joshbraun.com](https://joshbraun.com)).
