---
name: graph-first
description: MANDATORY for any task that reads, explains, searches, plans, or changes code or docs in this repo. Consult the graphify knowledge graph (graphify-out/) BEFORE opening source files, then keep the graph in sync after every change.
---

# Graph-first (mandatory)

This repo has a knowledge graph of all code + docs in `graphify-out/`:
- `graph.json` — nodes/edges (query with the `graphify` CLI)
- `GRAPH_REPORT.md` — god nodes, communities, surprising links

**Order is fixed: GRAPH → CODE → GRAPH.** Never skip a step.

## 1. Before touching code — read the graph first

Run at least one of these before any Read/Grep of source files:

```bash
graphify query "<the task in plain words>" --budget 1500   # broad context
graphify explain "<symbol or concept>"                       # one node + its neighbors
graphify path "<A>" "<B>"                                    # how two things connect
graphify affected "<symbol>"                                 # what breaks if I change this
```

- Use the returned `src=` / `loc=` to pick exactly which files to open.
- Before editing a function/script, ALWAYS run `graphify affected "<it>"` and
  check every caller it lists.
- If the graph has no match (exit code 4), say so, then fall back to Grep.
- If `graphify-out/graph.json` is missing, build it first with `/graphify .`.

## 2. Then read the code

The graph is a map, not the source of truth. Confirm in the actual files before
answering or editing. If the graph was wrong or stale, say so.

## 3. After any change — update the graph

| You changed | Run |
|---|---|
| Code (`.ts .js .json .yaml .sql`) | `graphify update .` (local, free, no LLM) |
| Docs (`.md .html .txt`), skills, references | `/graphify . --update` (re-extracts changed docs) |
| Deleted/renamed files | `graphify update . --force` |

- Do this BEFORE reporting the task as done, and mention it in your summary
  ("graph updated: N nodes").
- If the update fails, report the error — never claim the graph is current.

## Rules
- No source-file reads before a graph lookup (except the file the user explicitly names).
- No finished task with code/doc changes and a stale graph.
- Cite graph facts with their `src=`/`loc=`.
