# CLAUDE.md — Friday Ticket Feedback

Guidance for Claude Code (and humans) working in this repo.

## Project

A lightweight Next.js (App Router, JavaScript) web app that collects a customer
CSAT rating (1–5 stars) + optional comment for a specific support ticket and
writes it to a Google Sheet. Customers reach it via a per-ticket link embedded
in the resolution email, e.g. `friday.vercel.app/TKT-93849?r=4`.

The authoritative design lives in [`docs/sdd/friday_feedback_hld.md`](docs/sdd/friday_feedback_hld.md).

## Implementation Workflow

Before implementing any plan under `docs/sdd/`, always:

1. **Create a checklist first** — Generate `docs/sdd/<plan_name>_checklist.md` with a markdown todo checklist derived from the plan's milestones, new files, modified files, and decisions. Each item should be a `- [ ]` checkbox with a concise description.
2. **Work through the checklist** — Implement one item at a time. Mark each item `- [x]` in the checklist file immediately after completing it.
3. **Keep the checklist current** — If implementation reveals new tasks or changes to the plan, add them to the checklist. Never leave the checklist stale.

Example: before implementing `docs/sdd/prod_setup.md`, create `docs/sdd/prod_setup_checklist.md`.

## Conventions

- **Minimal over abstract** — this is a small, single-purpose app. Prefer clear,
  direct code over premature abstraction.
- **Secrets are server-side only.** Never import credentials into client
  components. Everything under `lib/` is server-only.
- **No indexing.** Keep the `noindex` metadata, `X-Robots-Tag` header, and
  `robots.txt` disallow intact — this app must never be indexed.
