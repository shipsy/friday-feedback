# Feedback Link Generation — Spec for the Friday Side

**Audience:** whoever owns the pipeline that composes Friday's resolution
message in DevRev.
**Status:** Contract — v1 of the token scheme. Frozen; see §9 before changing anything.
**Owner:** Srijan · **Last updated:** 27 Aug 2026
**Counterpart:** [`friday_feedback_signed_links_hld.md`](friday_feedback_signed_links_hld.md) (the receiving app)

---

## 1. What you have to do

When Friday posts its answer on a ticket, append a feedback link to the **same
message**. You build that link yourself, offline, with a shared secret. There is
**no API to call** and nothing to register — you compute one 8-character tag and
paste the URL in.

```
Was this helpful?   Yes → https://friday.vercel.app/TKT-93849-NFWSZCQ6?r=yes
                    No  → https://friday.vercel.app/TKT-93849-NFWSZCQ6?r=no
```

Tapping either one **records that answer immediately** and lands the customer on
a short questionnaire — so the tap is never wasted, even if they read no
further. There is no Yes/No button on the website itself; the tap in your message
is the only place that answer is given (§5).

`NFWSZCQ6` is a truncated HMAC of the ticket number, keyed with a secret both
sides hold. It's what stops a stranger from typing `/TKT-00001` and leaving
feedback on someone else's ticket. Get the tag wrong and the link is dead — the
site shows "this link is invalid" and no feedback is recorded, so the algorithm
below has to be followed exactly.

---

## 2. The algorithm

```
1. canonical  = ticket.trim().toUpperCase()          e.g. "TKT-93849"
   must match ^[A-Z0-9-]{3,40}$                      else: don't send a link (§7)

2. mac        = HMAC_SHA256(key   = FEEDBACK_LINK_SECRET as utf8 bytes,
                            msg   = "v1:" + canonical  as utf8 bytes)

3. n          = first 5 bytes of mac, big-endian, as an integer   (40 bits)

4. tag        = 8 digits of base32 over n, most-significant first,
                alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

5. token      = canonical + "-" + tag
6. url        = FEEDBACK_BASE_URL + "/" + token        (+ "?r=yes" | "?r=no")
```

Notes that matter:

- **`"v1:"` is inside the hashed message.** Not a prefix on the output — hash
  the literal string `v1:TKT-93849`.
- **The alphabet is Crockford base32** — no `I`, `L`, `O`, or `U`, so nothing gets
  misread when a support agent retypes a link. 5 bytes is exactly 8 digits, no
  padding.
- **40 bits fits exactly in a JS `number`** (`2^40 < 2^53`), so plain integer
  arithmetic is safe — no BigInt needed.
- **Deterministic.** The same ticket always produces the same URL. Re-sending,
  retrying, or a second Friday reply on the same ticket all yield the identical
  link, which lands on the same row in the feedback sheet. That's intended: do
  **not** try to make links unique per send.

---

## 3. Reference implementation (TypeScript)

Node 18+. `createHmac` is the only platform call; the byte→integer loop is
deliberately `Buffer`-free so this also runs on Deno/edge if you swap in
`crypto.subtle.sign` (§3.3).

### 3.1 `feedbackLink.ts`

```ts
import { createHmac } from 'node:crypto';

/** Crockford base32 — omits I, L, O, U so tags survive being retyped. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** DevRev *display* ticket ids only (TKT-93849), never DON ids — see §6. */
const TICKET_RE = /^[A-Z0-9-]{3,40}$/;
const SCHEME = 'v1:';
const MAC_BYTES = 5; // 40 bits
const TAG_LEN = 8;   // 40 bits / 5 bits per base32 digit

export class InvalidTicketError extends Error {}

export interface FeedbackLinks {
  /** "TKT-93849-NFWSZCQ6" */
  token: string;
  /** Bare feedback URL, no query string. */
  url: string;
  /** URL that records "helpful" on arrival. */
  yes: string;
  /** URL that records "not helpful" on arrival. */
  no: string;
}

/** Uppercase + trim, and reject anything that isn't a display ticket id. */
export function canonicalTicket(raw: string): string {
  const ticket = raw.trim().toUpperCase();
  if (!TICKET_RE.test(ticket)) {
    throw new InvalidTicketError(`not a display ticket id: ${JSON.stringify(raw)}`);
  }
  return ticket;
}

/** First 40 bits of the MAC, as 8 Crockford base32 digits. */
function encodeTag(mac: Uint8Array): string {
  let n = 0;
  for (let i = 0; i < MAC_BYTES; i += 1) n = n * 256 + mac[i]; // exact: 40 < 53 bits
  let tag = '';
  for (let i = TAG_LEN - 1; i >= 0; i -= 1) {
    tag += CROCKFORD[Math.floor(n / 32 ** i) % 32];
  }
  return tag;
}

/** "TKT-93849" -> "TKT-93849-NFWSZCQ6". Stable for a given ticket + secret. */
export function feedbackToken(ticket: string, secret: string): string {
  const canonical = canonicalTicket(ticket);
  const mac = createHmac('sha256', secret).update(SCHEME + canonical).digest();
  return `${canonical}-${encodeTag(mac)}`;
}

/** The four strings a message template needs. */
export function feedbackLinks(
  ticket: string,
  secret: string,
  baseUrl: string,
): FeedbackLinks {
  const token = feedbackToken(ticket, secret);
  const url = `${baseUrl.replace(/\/+$/, '')}/${token}`;
  return { token, url, yes: `${url}?r=yes`, no: `${url}?r=no` };
}
```

### 3.2 Wiring it in

```ts
import { feedbackLinks, InvalidTicketError } from './feedbackLink';

/** Returns the markdown to append, or '' when no link can be built (§7). */
export function feedbackFooter(ticket: string): string {
  const secret = process.env.FEEDBACK_LINK_SECRET;
  const baseUrl = process.env.FEEDBACK_BASE_URL;
  if (!secret || !baseUrl) {
    console.error('feedback link skipped: FEEDBACK_LINK_SECRET/FEEDBACK_BASE_URL unset');
    return ''; // send the answer without a link — never send a broken one
  }
  try {
    const { yes, no } = feedbackLinks(ticket, secret, baseUrl);
    return `\n\n---\nWas this helpful?  [Yes](${yes})  ·  [No](${no})`;
  } catch (err) {
    if (err instanceof InvalidTicketError) {
      console.error('feedback link skipped:', err.message);
      return '';
    }
    throw err;
  }
}
```

### 3.3 If you're not on Node

Replace only the `createHmac` line; everything else is portable.

```ts
const key = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(secret),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
);
const mac = new Uint8Array(
  await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(SCHEME + canonical)),
);
```

Python, for reference: `hmac.new(secret.encode(), b"v1:" + canonical.encode(), "sha256").digest()[:5]`.

---

## 4. Test vectors — the actual contract

Check your implementation against these before shipping. **These are the
agreement between the two sides**, not the code: if your output matches, your
links work, whatever language you wrote it in.

Secret: `dummy_secret_for_test_vectors_only` (test only — never use this)

| Input ticket | Expected token |
|---|---|
| `TKT-93849` | `TKT-93849-NFWSZCQ6` |
| `tkt-93849` | `TKT-93849-NFWSZCQ6` |
| `  TKT-93849  ` | `TKT-93849-NFWSZCQ6` |
| `TKT-1` | `TKT-1-FP7NCCMS` |
| `TICKET-000123` | `TICKET-000123-329GW28V` |
| `ABC` | `ABC-YA3HBSP0` |
| `TKT/93849`, `don:core:…:ticket/93849`, `AB`, 41+ chars | `InvalidTicketError` |

Same ticket, a different secret (`a_different_secret`) → `TKT-93849-EX81FWJQ`.
A one-character difference in the secret changes the whole tag; there is no
partial credit.

Drop this in your test file:

```ts
import assert from 'node:assert/strict';
import { feedbackToken } from './feedbackLink';

const S = 'dummy_secret_for_test_vectors_only';
assert.equal(feedbackToken('TKT-93849', S), 'TKT-93849-NFWSZCQ6');
assert.equal(feedbackToken('  tkt-93849 ', S), 'TKT-93849-NFWSZCQ6');
assert.equal(feedbackToken('TKT-1', S), 'TKT-1-FP7NCCMS');
assert.throws(() => feedbackToken('don:core:dvrv-us-1:devo/x:ticket/93849', S));
```

---

## 5. What the link does when it's opened

Opening the link **records the answer before the customer does anything else** —
that's the point of putting it in the message rather than asking on the page. The
site then shows a short questionnaire (a handful of optional questions); those
answers merge into the same row, whenever they arrive.

### 5.1 The `?r` parameter

| Link | Effect on open |
|---|---|
| `…/TKT-93849-NFWSZCQ6?r=yes` | records helpful = **yes**, then shows the questionnaire |
| `…/TKT-93849-NFWSZCQ6?r=no` | records helpful = **no**, then shows the questionnaire |
| `…/TKT-93849-NFWSZCQ6` | records nothing; questionnaire only |

`yes` and `no` are the only values that count; the site trims and lower-cases
first, so `?r=YES` works too — send lowercase anyway. Anything else is ignored
and treated as if `?r` were absent; it does not break the link.

Two things this gives your template:

- **One "Give feedback" link is a valid design.** Drop `?r` entirely if you'd
  rather not put two buttons in the message. You lose the one-tap rating, not the
  feedback.
- **A customer can change their mind.** Tapping the other link later overwrites
  the rating on the same row. Nothing to dedupe, nothing to expire, no "already
  answered" case for you to handle.

### 5.2 Don't let your own tooling open these links

Because the answer is recorded on open, anything that opens a link *on the
customer's behalf* can write a rating:

- link checkers and URL validators that execute JavaScript,
- message preview / unfurl services,
- QA scripts that render a real ticket's link to see if it works.

The write is fired by client-side JavaScript specifically so that plain HTML
fetches and simple crawlers record nothing — but don't lean on that. **Test with
a throwaway ticket id.** `TKT-TEST-1` mints and verifies exactly like a real one
and puts its junk row somewhere nobody mistakes it for customer feedback.

### 5.3 Optional: record a rating without a browser

You already hold everything the feedback API needs, because **the token is the
credential**. If Friday (or DevRev) ever captures a thumbs-up itself, it can post
the rating directly instead of waiting for a click:

```
POST https://friday.vercel.app/api/feedback
Content-Type: application/json

{ "token": "TKT-93849-NFWSZCQ6", "rating": "no" }
```

```
200  {"ok":true}
400  {"ok":false,"error":"invalid_link"}      // bad/missing token
400  {"ok":false,"error":"invalid_rating"}    // rating not "yes"/"no"
```

No API key and no auth header — a valid token *is* the authorization, which is
why §8 says to keep the secret in a secret manager. Ratings and questionnaire
answers merge per field into one row per ticket regardless of which arrives
first, so this is safe to mix with the emailed links: posting a rating never
clears answers the customer already gave, and vice versa.

This is **optional**. Nothing about the emailed links depends on it.

---

## 6. Which ticket id to use

Use the **display id** — `TKT-93849` — not the DevRev DON
(`don:core:dvrv-us-1:devo/xyz:ticket/93849`). Reasons:

- The DON contains `:` and `/`, which can't go in a URL path segment unencoded.
- The display id is what appears in the feedback sheet, and what a human reads
  when they go looking at the row.

Both sides must use the identical string. If your pipeline only has the DON on
hand, take the trailing `ticket/<n>` segment and reformat it as `TKT-<n>` —
and confirm the format with the owner first, because the sheet is keyed on it.

---

## 7. Failure handling

| Situation | What to do |
|---|---|
| `FEEDBACK_LINK_SECRET` or `FEEDBACK_BASE_URL` unset/empty | Send the answer **without** a link; log an error. |
| Ticket id fails validation | Same — no link, log the ticket. |
| Anything else throws | Let it surface; don't paste a partial URL. |

**Never send a link you couldn't sign.** A missing link costs one lost data
point. A link with a wrong or empty tag sends the customer to a dead
"this link is invalid" page after they've already tried to help you.

---

## 8. Do not

- **Don't** URL-encode, lowercase, truncate, or hyphenate the token — it goes in
  the path exactly as generated. It's already URL-safe.
- **Don't** add a trailing slash, or drop `?r=` while rewriting the URL.
  `?utm=…&r=yes` is fine — but a link tracker that rewrites the **path** kills
  the link (bad tag → "invalid link"), and one that *opens* the link to check it
  kills the **data** (§5.2). Verify both before turning a tracker on.
- **Don't** make links unique per send, or add a timestamp/nonce. The tag is a
  function of the ticket alone; anything extra breaks verification.
- **Don't** put the secret in a prompt, a template file, or anything checked into
  a repo. Env var or secret manager only — it's the thing keeping feedback
  unforgeable.
- **Don't** reimplement from memory later. Copy §3 or the vectors in §4.
- **Don't** send the same customer a second link for the same ticket expecting a
  second data point. One ticket is one row; the later answer replaces the
  earlier one.

---

## 8a. The two variables, named

On the **sender** side (Friday) the code reads `FEEDBACK_LINK_SECRET` and
`FEEDBACK_BASE_URL` (`src/config.ts`). The feedback app's own CLI helper uses
`APP_BASE_URL` for its local base — a different service, a different variable.
Only `FEEDBACK_LINK_SECRET` must be **identical** on both sides; the base URLs
differ per environment by design.

---

## 9. Changing the scheme / rotating the key

Links live in customer inboxes for weeks, so both sides move together:

- **Rotating the secret:** the receiving app accepts a list
  (`FEEDBACK_LINK_SECRETS_ACCEPTED`) during a changeover. Order: add the new
  secret to the app's accepted list → switch Friday to the new secret → after
  outstanding emails have aged out, drop the old one. Flip Friday first and old
  links die instantly.
- **Changing the algorithm** (tag length, alphabet, MAC input): bump `"v1:"` to
  `"v2:"` and get the app deployed with support for both first. The test vectors
  in §4 exist to make an accidental change loud instead of silent.

Contact the owner of [`friday_feedback_signed_links_hld.md`](friday_feedback_signed_links_hld.md)
before either.
