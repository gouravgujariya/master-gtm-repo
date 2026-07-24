# profiles/ — client workspaces (agency, multi-client)

**One folder per client.** Each client engagement gets its own workspace. This directory is git-ignored
(client data is private) except the template.

## Standard client folder structure
```
profiles/<client-slug>/
  context.md              # MAIN: who the client is, stage, notes (read this first)
  client-profile.yaml     # ICP, offer, primary persona, chosen stack
  inputs/                 # what the CLIENT gives us
    questionnaire.md      #   onboarding answers
    <case studies, decks, docs, customer lists, transcripts>
  lead-database/          # what WE produce — all lead CSVs + the final campaign file
    companies-<slug>.csv
    contacts-<slug>.csv
    contacts-verified-<slug>.csv
    final-campaign-<slug>.csv   # THE deliverable: contacts + emails + personalized copy, one file
  campaigns/              # sequence.json / copy / upload logs
  research/               # FireCrawl website research
  results/                # reply scoring, experiments (post-launch)
```

- **inputs/** = raw client material in. **lead-database/** = finished data out. **context.md** = the brief.
- The `final-campaign-<slug>.csv` in `lead-database/` is the single self-contained deliverable — contacts,
  verified emails, and the personalized emails all in one file. See its README for the column schema.

## Start a new client
```
npm run new-client -- --name="Acme Co"
```
Creates `profiles/acme-co/` from `_TEMPLATE-client/`, stamped with the name. Then fill `inputs/questionnaire.md`
and run `/cold-email-kickoff`.

**Real client campaigns run step-by-step with sign-off at each stage** (see `docs/campaign-workflow-rules.md`).
