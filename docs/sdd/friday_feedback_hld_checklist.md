# Implementation Checklist — Friday Ticket Feedback

Derived from [`friday_feedback_hld.md`](friday_feedback_hld.md). Work through one
item at a time; mark `- [x]` immediately after completing each.

## Decisions (locked before build)

- [x] Repo: personal account `srijan-srivastava-shipsy`, **private**, name `friday-feedback`.
- [x] Write strategy: **upsert by ticket** (the HLD "Preferred" — one CSAT per ticket), not plain append. Satisfies AC "re-submitting updates the row".
- [x] Rate limiting: **removed** at owner's request (2 Jul 2026) — no Upstash dependency.
- [x] Ticket form split into a server shell (`page.jsx`) + a `use client` form component.

## Project files (§10)

- [x] `package.json` — `next`, `react`, `react-dom`, `googleapis`; scripts (Upstash removed).
- [x] `.gitignore` — `node_modules`, `.next`, `.env*.local`, build artifacts.
- [x] `.env.local.example` — all vars from §9 with empty values.
- [x] `next.config.js` — security headers + `X-Robots-Tag` (§12).
- [x] `app/globals.css` — plain CSS; responsive to ~360px; focus states; `prefers-reduced-motion`.
- [x] `app/layout.jsx` — root layout, metadata with `robots: noindex, nofollow` (§12).
- [x] `app/page.jsx` — minimal root placeholder ("opens from your support email").
- [x] `app/robots.js` — `robots.txt` disallow all (§12).
- [x] `app/[ticket]/page.jsx` — server shell: read `ticket` param + `r`/`c` query; validate ticket pattern; render form or "invalid link" state.
- [x] `app/[ticket]/FeedbackForm.jsx` — `use client` form: star selector (prefilled from `r`), comment, honeypot, submit → success/error inline.
- [x] `app/api/feedback/route.js` — POST handler: validate → Sheets upsert; return 200/400/500.
- [x] `lib/sheets.js` — service-account JWT client + `upsertFeedback` (read col A, update or append).
- [x] ~~`lib/rateLimit.js`~~ — removed (rate limiting dropped at owner's request).
- [x] `jsconfig.json` — `@/*` path alias (added during build).
- [x] `README.md` — setup (§8), env (§9), deploy (§13).
- [x] `CLAUDE.md` — project guidance + Implementation Workflow.

## API contract (§7) — verified via live curl

- [x] Request body: `{ ticket, rating, comment, customer, website }`.
- [x] Validate `ticket` matches `^[A-Za-z0-9\-]{3,40}$` (rejects bad chars + >40).
- [x] Validate `rating` is an integer 1–5 (rejects 0, 6, 3.5, missing).
- [x] `comment` ≤ 1000 chars; strip control characters (codepoint stripper, keeps tab/nl in comment).
- [x] Honeypot `website` non-empty → return 200 without writing (silent bot drop).
- [x] Responses: 200 `{ok:true}` / 400 `{ok:false,error}` / 500 `server_error`.

## Feedback page behavior (§6)

- [x] Prefill rating from `?r=<1-5>` (verified: `?r=4` → 4 filled stars, 4th `aria-checked`).
- [x] Rating required (1–5) client-side; comment optional, max 1000 chars.
- [x] Hidden honeypot input named `website`.
- [x] Success ("Thanks — your rating for `<ticket>` is recorded") / error state inline.
- [x] Keyboard-operable stars (arrow keys + Home/End), roving tabindex, visible focus, reduced-motion, works to ~360px.

## Google Sheets (§8)

- [x] Header row model: `ticket · rating · comment · submitted_at · customer · user_agent`.
- [x] Upsert by ticket (read column A; update matching row else append); ensure header exists.
- [x] Decode `GOOGLE_SERVICE_ACCOUNT_KEY` from raw JSON or base64; RAW value input (no formula injection).

## Compliance / non-functional (§12) — verified via response headers

- [x] `noindex, nofollow` meta in `layout.jsx`.
- [x] `X-Robots-Tag` + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer` in `next.config.js`.
- [x] `robots.txt` disallow all.
- [x] No secrets referenced from client components (scanned `.next/static` — clean; googleapis not client-bundled).

## Verify before handoff (§15 acceptance criteria)

- [x] `/TKT-93849` renders the feedback page (HTTP 200).
- [x] `?r=4` pre-selects 4 stars on load.
- [ ] Submitting (with/without comment) writes a correct row. — **code path verified up to the Sheets call; actual write needs live Google creds (not available in this env). Reaches `upsertFeedback` and fails gracefully with 500 when creds absent.**
- [ ] Re-submitting the same ticket updates its row (upsert). — **same: requires live creds to confirm end-to-end; upsert logic reviewed.**
- [x] Missing/invalid rating blocked client- and server-side.
- [x] Honeypot-filled request returns 200 but writes nothing.
- [x] Invalid ticket pattern shows the "invalid link" state.
- [x] No secrets in client bundles; page is `noindex`.
- [x] Keyboard-navigable; works on ~360px viewport.
- [x] `next build` succeeds.

## Post-review hardening (adversarial review confirmed 5 low-sev findings)

- [x] CSV/formula injection: neutralize leading `= + - @ tab` in comment/customer/user_agent before writing (`lib/sheets.js`). RAW input already keeps the live sheet inert; this protects CSV export / Looker re-import.
- [x] Screen-reader success announcement: persistent `sr-only` `aria-live` region + focus moved to the confirmation heading (`FeedbackForm.jsx`, `.sr-only` in `globals.css`).
- [x] Resilience: `getSheetsClient()` no longer caches a rejected init promise (would otherwise wedge a warm instance into permanent 500s).
- [x] Concurrency: documented the non-atomic read-then-write upsert race as a conscious "latest wins" choice (code comment in `lib/sheets.js`).
- [x] Removed dead `"lint": "next lint"` script (`next lint` removed in Next 16).
- [x] Re-ran `next build` + runtime checks after fixes — no regressions.

## Repo finalize

- [x] Create private GitHub repo `friday-feedback` under `srijan-srivastava-shipsy`.
- [x] Initial commit + push (`main` → https://github.com/srijan-srivastava-shipsy/friday-feedback).

## Provisioning — Google Sheet

- [x] Created the destination Google Sheet; recorded its `SHEET_ID` + `SHEET_TAB`
      in local `.env.local` (gitignored, never committed). A new sheet's first tab
      is `Sheet1`.
- [ ] **Owner action:** share the sheet with the service-account email
      (`<name>@<project>.iam.gserviceaccount.com`) as **Editor** — this is what
      grants write access.
- [ ] **Owner action:** set `GOOGLE_SERVICE_ACCOUNT_KEY` to the service-account
      JSON key (local `.env.local` and Vercel env vars).
