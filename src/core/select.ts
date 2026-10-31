// Deterministic decision-maker selection from AgenticData search results (pure).
// Ranks candidates by target title + seniority, extracts the BUSINESS email.

const SENIORITY = [
  ["founder", 100], ["owner", 100], ["ceo", 95], ["chief", 90], ["president", 88],
  ["vp", 80], ["vice president", 80], ["head", 75], ["director", 70], ["principal", 60],
  ["lead", 55], ["manager", 50], ["senior", 40],
] as const;

export const CONTACT_COLS = ["email", "first_name", "last_name", "company_name", "company_domain", "title", "linkedin_url", "find_source", "email_kind"];

export function seniorityScore(title: string): number {
  const t = title.toLowerCase();
  let best = 0;
  for (const [kw, w] of SENIORITY) if (t.includes(kw)) best = Math.max(best, w as number);
  return best;
}

export function titleMatchScore(title: string, targetKeywords: string[]): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const kw of targetKeywords) if (kw && t.includes(kw)) score += 20;
  return score;
}

function firstPersonalEmail(raw: string | null): string | null {
  if (!raw) return null;
  try { const arr = JSON.parse(raw); return Array.isArray(arr) && arr.length ? String(arr[0]) : null; }
  catch { return null; }
}

/** titles: comma-separated target titles (as passed to --titles). */
export function selectContacts(
  records: any[],
  opts: { titles?: string; perCompany?: number; allowPersonal?: boolean } = {},
): { contacts: Record<string, string>[]; companies: number; skippedNoEmail: number } {
  const targets = String(opts.titles || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const perCompany = opts.perCompany ?? 1;
  const allowPersonal = Boolean(opts.allowPersonal);

  // group by company_domain
  const byCompany = new Map<string, any[]>();
  for (const r of records) {
    const dom = (r.company_domain || r.company_name || "unknown").toLowerCase();
    (byCompany.get(dom) || byCompany.set(dom, []).get(dom)!).push(r);
  }

  const out: Record<string, string>[] = [];
  let skippedNoEmail = 0;
  for (const [dom, people] of byCompany) {
    const ranked = people
      .map((p) => {
        const title = p.job_title || "";
        const business = p.primary_email || null;
        const personal = allowPersonal ? firstPersonalEmail(p.personal_emails) : null;
        const email = business || personal;
        const score = titleMatchScore(title, targets) + seniorityScore(title) + (business ? 15 : 0);
        return { p, title, email, business: !!business, score };
      })
      .filter((c) => c.email) // must have some email to be sendable-eligible
      .sort((x, y) => y.score - x.score);

    if (!ranked.length) { skippedNoEmail++; continue; }

    for (const c of ranked.slice(0, perCompany)) {
      out.push({
        email: c.email!,
        first_name: c.p.first_name || "",
        last_name: c.p.last_name || "",
        company_name: c.p.company_name || "",
        company_domain: c.p.company_domain || dom,
        title: c.title,
        linkedin_url: c.p.linkedin_url || "",
        find_source: "agenticdata",
        email_kind: c.business ? "business" : "personal",
      });
    }
  }
  return { contacts: out, companies: byCompany.size, skippedNoEmail };
}
