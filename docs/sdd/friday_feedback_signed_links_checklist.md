# Implementation Checklist — Signed Links + FR Feedback Questions

Derived from [`friday_feedback_signed_links_hld.md`](friday_feedback_signed_links_hld.md)
and [`friday_feedback_signed_links_sdd.md`](friday_feedback_signed_links_sdd.md).
Questions grounded in [`friday_fr_failure_taxonomy.md`](friday_fr_failure_taxonomy.md).

## Decisions locked before build (owner, 27 Aug 2026)

- [x] Friday mints links itself with the shared secret — **no** `/api/link` endpoint.
- [x] Rating is an API field. **No** yes/no control on the `?r=` arrival pages;
      the bare link keeps the classic Yes/No control (revised 27 Aug 2026).
- [x] **`?r=yes` → plain thank-you, rating recorded, no questions asked.**
- [x] **`?r=no` → record the no, then ask the three approved questions + free text.**
- [x] **Bare link (no `?r`) → the classic form: Yes/No + comment, with the reason
      questions revealed on No.** A comment is available even on a Yes.
- [x] Customer question set approved (HLD §7.3): `cust_problem`, `outcome`, `cust_needed`.
- [x] Gate is `showWhen: 'no'` on the two reason questions; `cust_needed` is
      ungated with a `labelNo` that sharpens the prompt on a no.
- [x] **Engineer/internal question set deferred** — documented in HLD §7.3 as the
      pending addition, NOT built. Its columns append later (J–M) under the
      append-only id rule.
- [x] **Token scope (`v1:i:`) deferred with it** — one code path, and the published
      customer vectors stay byte-identical.
- [x] New Google Sheets **tab** for this flow (`SHEET_TAB`), auto-created if absent.
      The existing tab is not touched.

## Files

- [x] `lib/token.js` — canonicalTicket, makeToken, verifyToken, acceptedSecrets, fail-closed.
- [x] `lib/token.test.js` — known-answer vector + tamper/rotation/fail-closed cases.
- [x] `lib/questions.js` — schema, `questionsFor`, `sanitizeAnswers`, `colLetter`, `range`.
- [x] `lib/questions.test.js` — gating, option hygiene, sanitize, columns, tab quoting.
- [x] `lib/sheets.js` — computed ranges A:I, quoted tab, auto-create tab, self-healing
      header, `mergeRow` field-level merge, formula neutralisation.
- [x] `lib/sheets.test.js` — mergeRow invariants (pure, no network).
- [x] `app/[token]/page.jsx` — verify token, derive ticket, invalid-link state.
- [x] `app/[token]/Questionnaire.jsx` — arrival rating POST, yes→thank-you,
      no→questions, submit, error states, a11y.
- [x] `app/api/feedback/route.js` — token-only, ordered validation, merge write.
- [x] `app/globals.css` — chip/scale/question-block/thanks styles.
- [x] `scripts/link.js` — CLI link generator.
- [x] `app/[ticket]/` deleted (no unsigned bypass path).
- [x] `.env.local.example` + `package.json` `test` script.

## Local verification

- [x] `npm test` — all unit tests pass.
- [x] `next build` clean.
- [x] `node scripts/link.js TKT-TEST-1` prints a stable URL; twice = identical.
- [x] Sheets tab auto-created; header written.
- [x] `?r=yes` → thank-you only, no questions in the HTML, row written with `rating=yes`.
- [x] `?r=no` → three questions, no rating control; submit writes answers.
- [x] Bare link → classic Yes/No + comment; No reveals the questions, Yes collapses them.
- [x] Bare link, Yes + comment → both written (TKT-TEST-4).
- [x] Bare link, no rating chosen → blocked with "Please choose Yes or No.".
- [x] Tampered tag → invalid-link card, no row.
- [x] `POST` with raw `ticket` and no token → 400 `invalid_link`, nothing written.
- [x] Honeypot → 200, nothing written.
- [x] `empty_payload` → 400.
- [x] Secret unset → every link invalid (fail closed).
- [x] No secret in the client bundle; security headers + noindex intact.

## Owner actions still outstanding

- [ ] Set `FEEDBACK_LINK_SECRET` in Vercel (Preview **and** Production).
- [ ] Hand `friday_link_generation_spec.md` + the secret to the Friday pipeline owner.
- [ ] Sign off (or drop) the deferred engineer question set, HLD §7.3.
- [ ] Security items in `friday_fr_failure_taxonomy.md` §5 need an owner.
