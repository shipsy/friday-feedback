# Friday Ticket Feedback

A lightweight Next.js (App Router, JavaScript) app that collects a customer
yes/no rating ("was the AI's response helpful?") + optional comment for a
support ticket and writes it to a Google Sheet. Customers reach it via a
per-ticket link in the resolution email:

```
https://friday.vercel.app/TKT-93849?r=yes
```

Tapping Yes/No in the email opens the page with that answer pre-selected; the
customer submits and the response is upserted into a sheet keyed by ticket.

Design doc: [`docs/sdd/friday_feedback_hld.md`](docs/sdd/friday_feedback_hld.md).

---

## How it works

- **Route** `app/[ticket]/page.jsx` matches `/<ticket>` (e.g. `/TKT-93849`).
  `?r=yes` / `?r=no` pre-selects the answer; `?c=<name>` optionally passes a
  customer label. Neither is signed — they're convenience only; the submitted
  rating is what counts.
- The page validates the ticket against `^[A-Za-z0-9-]{3,40}$` and shows an
  "invalid link" state otherwise.
- Submit → `POST /api/feedback` → server validation → **upsert** into the sheet
  (one row per ticket; re-submitting updates it).
- A hidden honeypot field (`website`) filters bots.

> **Tradeoff (HLD §11):** routing is on the raw ticket number, so links are
> guessable. Accepted for this version; honeypot + upsert-by-ticket are the
> cheap mitigations. Upgrade path is signed tokens (`/f/<hmac>`).

---

## Google Sheets setup (one-time)

1. Create a Google Cloud project and **enable the Google Sheets API**.
2. Create a **service account** and generate a **JSON key**.
3. Create the destination Google Sheet; copy its **spreadsheet ID** from the URL
   (`.../spreadsheets/d/<SHEET_ID>/edit`).
4. **Share the sheet with the service account's email**
   (`…@….iam.gserviceaccount.com`) as **Editor** — this grants write access.
5. Add the credentials to your env (below). The header row
   (`ticket · rating · comment · submitted_at · customer · user_agent`) is
   written automatically on first submit if the tab is empty.

---

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Service-account JSON — raw single-line string **or** base64 (both decoded in `lib/sheets.js`) |
| `SHEET_ID` | Target spreadsheet ID |
| `SHEET_TAB` | Tab/worksheet name (e.g. `Sheet1` or `Feedback`) |

All secrets are **server-side only** and never referenced from client
components. On Vercel, add them under **Project → Settings → Environment
Variables**.

---

## Run locally

```bash
npm install
npm run dev
# visit http://localhost:3000/TKT-TEST?r=yes
```

## Deploy (Vercel)

```bash
# add the env vars in the Vercel dashboard first, then:
vercel deploy          # preview
vercel deploy --prod   # production
```

The repo includes a minimal [`vercel.json`](vercel.json) pinning the Next.js
framework; no other Vercel config is needed. Set `GOOGLE_SERVICE_ACCOUNT_KEY`,
`SHEET_ID`, and `SHEET_TAB` as Environment Variables in the Vercel project
(Production + Preview).

---

## Project structure

```
friday-feedback/
├─ app/
│  ├─ layout.jsx              # root layout + noindex metadata
│  ├─ page.jsx                # minimal root placeholder
│  ├─ globals.css
│  ├─ robots.js               # robots.txt: disallow all
│  ├─ [ticket]/
│  │  ├─ page.jsx             # server shell: validate + prefill
│  │  └─ FeedbackForm.jsx     # client form: yes/no + comment + honeypot
│  └─ api/feedback/route.js   # POST → validate → Sheets upsert
├─ lib/
│  └─ sheets.js               # service-account client + upsert
├─ docs/sdd/                  # design doc + implementation checklist
├─ next.config.js             # security + noindex headers
├─ vercel.json                # Vercel: pins the Next.js framework
├─ jsconfig.json              # @/* path alias
└─ .env.local.example
```

---

## Compliance notes

- **Not indexed:** `noindex, nofollow` metadata, an `X-Robots-Tag` header on
  every response, and `robots.txt` disallow-all.
- **Security headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`.
- **No customer identity in the URL** — the slug is the internal ticket ID only;
  any customer name is passed as data (`?c=`), not in the path.
