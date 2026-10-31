// Zod schemas for every LLM job result (docs/backend-contract.md). Also used as structured-output JSON schemas.
import { z } from "zod";

const strs = z.array(z.string());

export const Icp = z.object({
  name: z.string(),
  domain: z.string(),
  description: z.string(),
  foundedYear: z.number().int().optional(),
  employees: z.string().optional(),
  geo: z.string().optional(),
  keywords: strs.max(10),
  product: z.object({ title: z.string(), points: strs.length(3) }),
  icp: z.object({
    personas: strs,
    titles: strs,
    industries: strs,
    geographies: strs,
    companySize: z.string(),
    valueProp: z.string(),
    seedDomains: strs,
  }),
});
export type Icp = z.infer<typeof Icp>;

export const Competitors = z.object({
  queries: strs.length(3),
  competitors: z.array(z.object({ domain: z.string(), name: z.string(), why: z.string() })).max(15),
});
export type Competitors = z.infer<typeof Competitors>;

// Mirrors docs/campaign-angles.md (content/podcast/association/funding/... → custom).
export const ANGLES = ["creative-ideas", "new-hire", "lookalike", "competitor-engagers", "hiring", "tech-stack", "tenure", "local", "firmographic", "custom"] as const;
export const VALUE_PROPS = ["make money", "save time", "save money", "reduce risk"] as const;

export const Segment = z.object({
  name: z.string(),
  angle: z.enum(ANGLES),
  icon: z.string(),
  sizeEstimate: z.string(),
  desc: z.string(),
  pain: z.string(),
  criteria: strs,
  examples: strs,
  valuePropCategory: z.enum(VALUE_PROPS),
  targeting: z.object({
    dataset: z.enum(["saas", "local", "lookalike", "none"]),
    filters: z.record(z.string(), z.union([z.string(), z.boolean()])), // = providers/bulk.ts Filters
    seedDomains: strs,
    titles: strs,
  }),
});
export const Segments = z.object({ segments: z.array(Segment).length(6) });
export type Segments = z.infer<typeof Segments>;

export const CopySequence = z.object({
  subject: z.string().regex(/^\S+(\s+\S+){1,2}$/, "subject must be 2-3 words"),
  sequence: z.array(z.object({ step: z.number().int(), waitDays: z.number().int(), body: z.string() })),
});
export const LeadBodies = z.object({ leads: z.array(z.object({ email: z.string(), body: z.string() })) });
export const Copy = CopySequence.extend(LeadBodies.shape);
export type Copy = z.infer<typeof Copy>;

// Non-LLM result rows (contract), used to check fixtures.
export const CompanyRow = z.object({
  companyName: z.string(), domain: z.string(), industry: z.string().optional(), companySize: z.string().optional(),
  location: z.string().optional(), listSource: z.string(),
});
export const ContactRow = z.object({
  email: z.string(), firstName: z.string(), lastName: z.string(), title: z.string(), companyName: z.string(),
  companyDomain: z.string(), findSource: z.string(), linkedinUrl: z.string().optional(),
});
