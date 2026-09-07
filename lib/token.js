// Signed link IDs. See docs/sdd/friday_feedback_signed_links_hld.md §2.
//
// A token is `<CANONICAL TICKET>-<8-char tag>`, where the tag is the first 40
// bits of HMAC-SHA256(secret, "v1:" + ticket) in Crockford base32. Deterministic,
// so anyone holding the secret regenerates the identical URL; verifiable in O(1)
// with no storage, because the token carries the ticket the MAC is over.
//
// Server-only. Never import from a client component.
import { createHmac, timingSafeEqual } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O, U
const TICKET_RE = /^[A-Z0-9-]{3,40}$/;
const TAG_RE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/; // alphabet only => 8 ASCII bytes
const SCHEME = 'v1:';
const MAC_BYTES = 5;
const TAG_LEN = 8;
const MIN_TOKEN = 3 + 1 + TAG_LEN; // 12
const MAX_TOKEN = 40 + 1 + TAG_LEN; // 49

export class InvalidTicket extends Error {}

// Primary first; the rest are accepted on verify only, for key rotation.
function acceptedSecrets() {
  const primary = (process.env.FEEDBACK_LINK_SECRET || '').trim();
  const extra = (process.env.FEEDBACK_LINK_SECRETS_ACCEPTED || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return primary ? [primary, ...extra] : [];
}

export function canonicalTicket(raw) {
  if (typeof raw !== 'string') return null;
  const ticket = raw.trim().toUpperCase();
  return TICKET_RE.test(ticket) ? ticket : null;
}

function tagFor(ticket, secret) {
  const mac = createHmac('sha256', secret).update(SCHEME + ticket).digest();
  let n = 0;
  for (let i = 0; i < MAC_BYTES; i += 1) n = n * 256 + mac[i]; // 40 bits, exact
  let tag = '';
  for (let i = TAG_LEN - 1; i >= 0; i -= 1) {
    tag += CROCKFORD[Math.floor(n / 32 ** i) % 32];
  }
  return tag;
}

export function makeToken(rawTicket) {
  const ticket = canonicalTicket(rawTicket);
  if (!ticket) throw new InvalidTicket(`not a display ticket id: ${rawTicket}`);
  const [primary] = acceptedSecrets();
  if (!primary) throw new InvalidTicket('FEEDBACK_LINK_SECRET is not set');
  return `${ticket}-${tagFor(ticket, primary)}`;
}

// Returns the canonical ticket, or null. Never throws: both call sites (the page
// shell and the API) treat every failure identically, and a throw in a server
// component would surface a 500 instead of the invalid-link state.
export function verifyToken(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toUpperCase();
  if (s.length < MIN_TOKEN || s.length > MAX_TOKEN) return null;
  if (s[s.length - TAG_LEN - 1] !== '-') return null;

  const ticket = canonicalTicket(s.slice(0, -(TAG_LEN + 1)));
  // Crockford leniency applies to the TAG ONLY — never to the ticket, or
  // "INC-101" and "1NC-101" would collapse into one ticket.
  const tag = s.slice(-TAG_LEN).replace(/[IL]/g, '1').replace(/O/g, '0');
  if (!ticket || !TAG_RE.test(tag)) return null;

  const got = Buffer.from(tag, 'ascii');
  for (const secret of acceptedSecrets()) {
    const want = Buffer.from(tagFor(ticket, secret), 'ascii');
    if (got.length === want.length && timingSafeEqual(got, want)) return ticket;
  }
  // Also the path taken when no secret is configured — fail closed, never open.
  return null;
}
