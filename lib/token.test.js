import assert from 'node:assert/strict';
import test from 'node:test';

const SECRET = 'dummy_secret_for_test_vectors_only';

// Fresh module per case: acceptedSecrets() reads the env at call time, but
// importing once and mutating process.env is enough here.
process.env.FEEDBACK_LINK_SECRET = SECRET;
delete process.env.FEEDBACK_LINK_SECRETS_ACCEPTED;

const { makeToken, verifyToken, canonicalTicket, InvalidTicket } = await import('./token.js');

test('known-answer vectors — these are published to the Friday side and must never change', () => {
  assert.equal(makeToken('TKT-93849'), 'TKT-93849-NFWSZCQ6');
  assert.equal(makeToken('TKT-1'), 'TKT-1-FP7NCCMS');
  assert.equal(makeToken('TICKET-000123'), 'TICKET-000123-329GW28V');
  assert.equal(makeToken('ABC'), 'ABC-YA3HBSP0');
});

test('canonicalisation: trim + uppercase', () => {
  assert.equal(makeToken('  tkt-93849 '), 'TKT-93849-NFWSZCQ6');
  assert.equal(canonicalTicket(' tkt-1 '), 'TKT-1');
  assert.equal(canonicalTicket('TKT/1'), null);
  assert.equal(canonicalTicket(42), null);
});

test('round-trips, case-insensitively', () => {
  for (const t of ['TKT-93849', 'TKT-1', 'ABC', 'TICKET-000123']) {
    const token = makeToken(t);
    assert.equal(verifyToken(token), t);
    assert.equal(verifyToken(token.toLowerCase()), t);
    assert.equal(verifyToken(`  ${token}  `), t);
  }
});

test('Crockford leniency applies to the tag, never to the ticket', () => {
  // Find a tag containing 0 or 1 so there is something to substitute.
  let token = null;
  for (let i = 1; i < 400 && !token; i += 1) {
    const candidate = makeToken(`TKT-${i}`);
    if (/[01]/.test(candidate.slice(-8))) token = candidate;
  }
  assert.ok(token, 'expected a tag containing 0 or 1');
  const lenient =
    token.slice(0, -8) + token.slice(-8).replace(/1/g, 'I').replace(/0/g, 'O');
  assert.equal(verifyToken(lenient), token.slice(0, -9));

  // The ticket half must NOT be normalised: these are different tickets.
  const a = makeToken('INC-101');
  const b = makeToken('1NC-101');
  assert.notEqual(a.slice(-8), b.slice(-8));
  assert.equal(verifyToken(`1NC-101-${a.slice(-8)}`), null);
  assert.equal(verifyToken(a), 'INC-101');
  assert.equal(verifyToken(b), '1NC-101');
});

test('rejects tampered, malformed and non-string input', () => {
  assert.equal(verifyToken('TKT-93849-NFWSZCQ0'), null, 'one char flipped');
  assert.equal(verifyToken('TKT-93849-NFWSZCQU'), null, 'U not in the alphabet');
  assert.equal(verifyToken('TKT-93849'), null, 'no tag');
  assert.equal(verifyToken('-NFWSZCQ6'), null, 'no ticket');
  assert.equal(verifyToken('123456789012'), null, 'no hyphen at -9');
  assert.equal(verifyToken('A'.repeat(60)), null, 'over max length');
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(null), null);
  assert.equal(verifyToken(undefined), null);
  assert.equal(verifyToken({}), null);
  assert.equal(verifyToken(12345678901234), null);
});

test('makeToken throws on a non-display ticket id', () => {
  for (const bad of [
    'don:core:dvrv-us-1:devo/x:ticket/93849',
    'AB',
    'A'.repeat(41),
    'TKT/93849',
    'TKT 93849',
  ]) {
    assert.throws(() => makeToken(bad), InvalidTicket, bad);
  }
});

test('rotation: an old secret verifies but never mints', () => {
  process.env.FEEDBACK_LINK_SECRET = 'new_primary_secret';
  process.env.FEEDBACK_LINK_SECRETS_ACCEPTED = ` ${SECRET} , `;
  assert.equal(verifyToken('TKT-93849-NFWSZCQ6'), 'TKT-93849');
  assert.notEqual(makeToken('TKT-93849'), 'TKT-93849-NFWSZCQ6');
  process.env.FEEDBACK_LINK_SECRET = SECRET;
  delete process.env.FEEDBACK_LINK_SECRETS_ACCEPTED;
});

test('fails CLOSED when no secret is configured', () => {
  delete process.env.FEEDBACK_LINK_SECRET;
  delete process.env.FEEDBACK_LINK_SECRETS_ACCEPTED;
  // The dangerous bug is the opposite: unset => accept everything.
  assert.equal(verifyToken('TKT-93849-NFWSZCQ6'), null);
  assert.throws(() => makeToken('TKT-93849'), InvalidTicket);
  process.env.FEEDBACK_LINK_SECRET = SECRET;
});
