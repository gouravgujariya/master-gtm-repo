// Prompts are built from the repo's own strategy docs at runtime (no copies). Static text first, job data last,
// so the system prompt is identical across clients and caches.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Icp, Competitors } from "./schemas.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const doc = (rel: string) => `<doc path="${rel}">\n${readFileSync(resolve(ROOT, rel), "utf8")}\n</doc>`;
const optDoc = (rel: string) => (existsSync(resolve(ROOT, rel)) ? doc(rel) : "");

const PREAMBLE = `You are a step inside an automated GTM backend job, not a chat. Never ask questions or wait for confirmation:
a human reviews and approves your output afterwards. The reference docs below describe an interactive process;
use them only for their rules, strategy and domain knowledge. Do not run scripts or touch files. Answer only with
the structured output. Use only facts from the inputs (or your web research when tools are given); never invent
customers, metrics or contacts.`;

const sys = (task: string, ...docs: string[]) => [PREAMBLE, task, ...docs.filter(Boolean)].join("\n\n");
const json = (v: unknown) => JSON.stringify(v, null, 2);
export interface Prompt { system: string; prompt: string }

export function icpPrompt(i: { website: string; researchMd: string; questionnaire?: string }): Prompt {
  return {
    system: sys(
      `TASK: Draft the client's company summary and ICP. keywords ≤10; product.points exactly 3; icp.seedDomains are the
client's named case-study customers' domains (empty if none named). Map client-profile.yaml's icp fields onto the output.`,
      doc("skills/icp-onboarding/SKILL.md"), doc("profiles/_TEMPLATE-client/client-profile.yaml"),
    ),
    prompt: `Website: ${i.website}\n\n<research>\n${i.researchMd}\n</research>` +
      (i.questionnaire ? `\n\n<questionnaire>\n${i.questionnaire}\n</questionnaire>` : ""),
  };
}

export function competitorsPrompt(i: { icp: Icp }): Prompt {
  return {
    system: sys(`TASK: Find the client's direct competitors. Write exactly 3 search queries a buyer would type, run them with
WebSearch (WebFetch to confirm a site if unsure), then return up to 15 real competitor companies (domain, name, one-line why).
Exclude the client itself, directories, and review/listicle sites.`),
    prompt: `<client_icp>\n${json(i.icp)}\n</client_icp>`,
  };
}

export function segmentsPrompt(i: { icp: Icp; competitors: Competitors; questionnaire?: string }): Prompt {
  return {
    system: sys(
      `TASK: Pick exactly 6 campaign segments for this client from the strategy menu (campaign-angles.md), using the
campaign-strategy skill's method. Each segment = one angle from the menu (angle enum: content/podcast/funding/... and the
client's own angle → "custom"). If the questionnaire states the client's own angle or existing GTM strategy, one segment
MUST be that angle ("custom"). Each segment needs targeting the sourcing step can run:
- dataset "saas" (US software/SaaS bulk list; filters keys: industry, location, size, name — substring match),
  "local" (local businesses bulk list; filters keys: category, state (2-letter), zip), "lookalike" (seedDomains from the ICP's
  case-study customers), or "none" (angle not sourceable from these yet, e.g. new-hire/hiring/competitor-engagers).
- titles: the decision-maker titles to find. sizeEstimate: rough count like "1.2K". icon: one emoji.`,
      doc("docs/campaign-angles.md"), doc("skills/campaign-strategy/SKILL.md"),
    ),
    prompt: `<client_icp>\n${json(i.icp)}\n</client_icp>\n\n<competitors>\n${json(i.competitors)}\n</competitors>` +
      (i.questionnaire ? `\n\n<questionnaire>\n${i.questionnaire}\n</questionnaire>` : ""),
  };
}

const copyDocs = (method: "default" | "braun") => method === "braun"
  ? [doc("skills/braun-copywriting/SKILL.md")]
  : [doc("skills/campaign-copywriting/SKILL.md"), optDoc("skills/campaign-copywriting/PERSONALIZATION-ADDENDUM.md")];

export function sequencePrompt(i: { icp: Icp; campaign: unknown; method: "default" | "braun" }): Prompt {
  return {
    system: sys(
      `TASK: Write the campaign's subject (2-3 words) and email sequence (step 1 at waitDays 0, then follow-ups).
Step 1 body is the shared template; each lead later gets its own personalized step-1 body. Use merge tags
{{first_name}} and {{company_name}} only. Follow the copy rules exactly (length, no em dashes, CTA).
Return leads as an empty array.`,
      ...copyDocs(i.method),
    ),
    prompt: `<client_icp>\n${json(i.icp)}\n</client_icp>\n\n<campaign>\n${json(i.campaign)}\n</campaign>`,
  };
}

export function leadBodiesPrompt(i: { icp: Icp; subject: string; step1: string; leads: unknown[]; method: "default" | "braun" }): Prompt {
  return {
    system: sys(
      `TASK: For each lead, write the personalized step-1 email body (company + persona personalization), same
offer and CTA as the template, merge tags resolved to real values. Return one {email, body} per lead, same emails.`,
      ...copyDocs(i.method),
    ),
    prompt: `<client_icp>\n${json(i.icp)}\n</client_icp>\n\nSubject: ${i.subject}\n<template>\n${i.step1}\n</template>\n\n<leads>\n${json(i.leads)}\n</leads>`,
  };
}
