import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HEADER_ROW,
  LAST_COL,
  QUESTIONS,
  colLetter,
  labelFor,
  questionsFor,
  range,
  sanitizeAnswers,
} from './questions.js';

test('no shows all three questions', () => {
  assert.deepEqual(questionsFor('no').map((q) => q.id), [
    'cust_problem',
    'outcome',
    'cust_needed',
  ]);
});

test('yes offers a comment and nothing else', () => {
  // ?r=yes never renders a form at all (the page is a thank-you), but the
  // classic form reuses this gate: picking Yes there leaves the comment box.
  assert.deepEqual(questionsFor('yes').map((q) => q.id), ['cust_needed']);
});

test('no rating chosen yet — comment only, reasons stay hidden', () => {
  assert.deepEqual(questionsFor('').map((q) => q.id), ['cust_needed']);
});

test('the comment prompt sharpens on a no', () => {
  const q = QUESTIONS.find((x) => x.id === 'cust_needed');
  assert.equal(labelFor(q, ''), 'Comment');
  assert.equal(labelFor(q, 'yes'), 'Comment');
  assert.equal(labelFor(q, 'no'), 'In one line — what did you need us to do?');
  // A question with no labelNo is unaffected.
  assert.equal(labelFor(QUESTIONS[0], 'no'), QUESTIONS[0].label);
});

test('option hygiene: unique ids and values, capped multi, no catch-all', () => {
  const ids = QUESTIONS.map((q) => q.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const q of QUESTIONS.filter((x) => x.options)) {
    const vals = q.options.map((o) => o.value);
    assert.equal(new Set(vals).size, vals.length, `${q.id} values unique`);
    // A catch-all absorbs taps that belong on a specific option.
    assert.ok(!vals.includes('other'), `${q.id} must not carry a catch-all`);
  }
  const cp = QUESTIONS.find((q) => q.id === 'cust_problem');
  assert.equal(cp.options.length, 6);
  assert.ok(cp.max < cp.options.length, 'cap must be below the option count');
});

test('sanitizeAnswers drops unknown ids and unknown option values', () => {
  assert.deepEqual(sanitizeAnswers({ bogus: 'x' }), {});
  assert.deepEqual(sanitizeAnswers({ outcome: 'maybe' }), {});
  assert.deepEqual(sanitizeAnswers({ cust_problem: ['nope'] }), { cust_problem: '' });
  assert.deepEqual(sanitizeAnswers(null), {});
  assert.deepEqual(sanitizeAnswers([]), {});
  assert.deepEqual(sanitizeAnswers('x'), {});
  assert.deepEqual(sanitizeAnswers({ outcome: 123 }), {});
});

test('multi answers are deduped, capped and stored in schema order', () => {
  assert.deepEqual(
    sanitizeAnswers({ cust_problem: ['no_fix', 'already_tried', 'already_tried'] }),
    { cust_problem: 'already_tried,no_fix' },
  );
  assert.deepEqual(
    sanitizeAnswers({
      cust_problem: ['no_fix', 'pushed_back', 'didnt_match', 'cant_do_it', 'already_tried'],
    }),
    { cust_problem: 'already_tried,cant_do_it,didnt_match' },
    'capped at max=3, schema order',
  );
  assert.deepEqual(sanitizeAnswers({ cust_problem: 'no_fix' }), {}, 'multi needs an array');
});

test('text is control-stripped, truncated and trimmed; empty is a real answer', () => {
  assert.deepEqual(sanitizeAnswers({ cust_needed: '  fix the COD sync  ' }), {
    cust_needed: 'fix the COD sync',
  });
  assert.equal(sanitizeAnswers({ cust_needed: 'x'.repeat(2000) }).cust_needed.length, 1000);
  // Absent means "don't touch"; present-and-empty means "clear the cell".
  assert.deepEqual(sanitizeAnswers({ cust_needed: '' }), { cust_needed: '' });
  assert.deepEqual(sanitizeAnswers({}), {});
});

test('columns are derived from the schema', () => {
  assert.deepEqual(HEADER_ROW, [
    'ticket',
    'rating',
    'submitted_at',
    'updated_at',
    'customer',
    'user_agent',
    'cust_problem',
    'outcome',
    'cust_needed',
  ]);
  assert.equal(LAST_COL, 'I');
});

test('colLetter handles AA and beyond', () => {
  assert.equal(colLetter(0), 'A');
  assert.equal(colLetter(6), 'G');
  assert.equal(colLetter(25), 'Z');
  assert.equal(colLetter(26), 'AA');
  assert.equal(colLetter(51), 'AZ');
  assert.equal(colLetter(52), 'BA');
});

test('tab names are quoted, so spaces and apostrophes work', () => {
  assert.equal(range('FR_Feedback', 'A1:I1'), "'FR_Feedback'!A1:I1");
  assert.equal(range('FR Feedback', 'A:I'), "'FR Feedback'!A:I");
  assert.equal(range("Bob's tab", 'A1'), "'Bob''s tab'!A1");
});
